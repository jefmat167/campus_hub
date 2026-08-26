import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { EscrowStatus } from '../../database/entities/escrow.entity';
import { DeliveryCode } from '../../database/entities/delivery-code.entity';
import {
  ListingStatus,
  DeliveryMethod,
} from '../../database/entities/listing.entity';
import { OrderMarket } from '../../database/entities/escrow.entity';

/**
 * Focused on the delivery-code verification lockout (anti-brute-force on the
 * 4-digit code). The full escrow lifecycle isn't exercised here — only enough
 * of `verifyDeliveryCode` to cover wrong-guess counting, the 5-attempt lock,
 * lock-blocks-correct-code, and the happy path.
 */
/** TimingPolicyService stub with the production defaults. */
function makeTimingPolicyStub(): any {
  return {
    resolve: () => ({
      confirmationHours: 24,
      fulfillmentHours: 72,
      disputeWindowMinutes: 1440,
      agreementHours: 72,
      appointmentHorizonDays: 14,
      noShowGraceMinutes: 30,
      appointmentBackstopHours: 24,
      offerLockHours: 24,
    }),
  };
}

/** UniversitySettingsService stub with the platform defaults. */
function makeSettingsStub(): any {
  return {
    resolve: jest.fn(async () => ({
      p2pFeePercent: 2.5,
      vendorFeePercent: 2.5,
      cancellationFeePercent: 10,
      cancellationFeeEnabled: true,
    })),
  };
}

function makeCode(overrides: Partial<DeliveryCode> = {}): DeliveryCode {
  const c = new DeliveryCode();
  c.id = 'dc1';
  c.escrowId = 'e1';
  c.code = '1234';
  c.validFrom = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
  c.validUntil = new Date(Date.now() + 60 * 60 * 1000); // 1h ahead
  c.isUsed = false;
  c.isInvalidated = false;
  c.verifyAttempts = 0;
  c.lockedUntil = null;
  return Object.assign(c, overrides);
}

function makeService(deliveryCode: DeliveryCode) {
  const escrow: any = {
    id: 'e1',
    sellerId: 's1',
    buyerId: 'b1',
    orderNumber: 'ORD-1',
    status: EscrowStatus.SELLER_READY,
  };
  const escrowRepo: any = { findOne: jest.fn(async () => escrow) };
  const deliveryCodeRepo: any = {
    findOne: jest.fn(async () => deliveryCode),
    save: jest.fn(async (c: any) => c),
  };
  const queryRunner: any = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    manager: { save: jest.fn(async (x: any) => x) },
  };
  const dataSource: any = { createQueryRunner: () => queryRunner };
  const escrowQueue: any = { add: jest.fn(async () => {}) };

  // Constructor arg order per escrow.service.ts; only the deps used by
  // verifyDeliveryCode are real, the rest are stubs.
  const svc = new EscrowService(
    escrowRepo,
    {} as any,
    deliveryCodeRepo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource,
    escrowQueue,
    {} as any,
    {} as any,
    makeTimingPolicyStub(),
    makeSettingsStub(),
  );
  return { svc, escrow, deliveryCode, deliveryCodeRepo, escrowQueue };
}

describe('EscrowService delivery-code verify lockout', () => {
  it('counts a wrong guess and reports remaining attempts', async () => {
    const code = makeCode();
    const { svc, deliveryCodeRepo } = makeService(code);

    await expect(
      svc.verifyDeliveryCode('e1', 's1', '0000'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(code.verifyAttempts).toBe(1);
    expect(deliveryCodeRepo.save).toHaveBeenCalled();
  });

  it('locks the code after the 5th wrong guess (and resets the counter)', async () => {
    const code = makeCode({ verifyAttempts: 4 }); // this is the 5th
    const { svc } = makeService(code);

    await expect(
      svc.verifyDeliveryCode('e1', 's1', '0000'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(code.lockedUntil).toBeInstanceOf(Date);
    expect(code.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(code.verifyAttempts).toBe(0);
  });

  it('blocks verification while locked, even with the correct code', async () => {
    const code = makeCode({ lockedUntil: new Date(Date.now() + 60_000) });
    const { svc } = makeService(code);

    await expect(
      svc.verifyDeliveryCode('e1', 's1', '1234'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the correct code within the window and marks DELIVERED', async () => {
    const code = makeCode();
    const { svc, escrow, escrowQueue } = makeService(code);

    const result = await svc.verifyDeliveryCode('e1', 's1', '1234');

    expect(result.status).toBe(EscrowStatus.DELIVERED);
    expect(code.isUsed).toBe(true);
    expect(escrowQueue.add).toHaveBeenCalled(); // 24h auto-release scheduled
  });
});

/** Fuller service for initiateEscrow / handleFulfillmentExpiry paths. */
function buildService(opts: { listing?: any; escrow?: any } = {}) {
  const escrowRepo: any = {
    findOne: jest.fn(async () => opts.escrow ?? null),
    create: (o: any) => ({ id: 'e-new', ...o }),
  };
  const listingRepo: any = { findOne: jest.fn(async () => opts.listing ?? null) };
  const walletService: any = {
    getBalance: jest.fn(async () => ({ availableBalance: 1_000_000 })),
    refundFunds: jest.fn(async () => {}),
    lockFunds: jest.fn(async () => {}),
    settleEscrow: jest.fn(async () => {}),
  };
  const platformWalletService: any = {
    creditPlatformFee: jest.fn(async () => {}),
  };
  const queryRunner: any = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    manager: {
      save: jest.fn(async (x: any) => x),
      update: jest.fn(async () => {}),
      find: jest.fn(async () => []),
      create: (_entity: any, o: any) => ({ ...o }),
    },
  };
  const dataSource: any = {
    createQueryRunner: () => queryRunner,
    query: jest.fn(async () => [{ seq: 42 }]),
  };
  const escrowQueue: any = { add: jest.fn(async () => {}), remove: jest.fn(async () => {}) };
  const buyRequestOfferRepo: any = { findOne: jest.fn(async () => null) };

  const svc = new EscrowService(
    escrowRepo,
    {} as any,
    {} as any,
    listingRepo,
    {} as any,
    {} as any,
    buyRequestOfferRepo,
    {} as any,
    walletService,
    platformWalletService,
    dataSource,
    escrowQueue,
    {} as any,
    {} as any,
    makeTimingPolicyStub(),
    makeSettingsStub(),
  );
  return { svc, walletService, platformWalletService, queryRunner, escrowQueue };
}

describe('EscrowService.createP2pSubOrder (checkout core)', () => {
  it('creates a MEETUP sub-order + snapshot items on the caller transaction', async () => {
    const { svc } = buildService({});
    const saved: any[] = [];
    const callerRunner: any = {
      manager: {
        save: jest.fn(async (x: any) => {
          saved.push(x);
          return { id: x.id ?? 'e-new', ...x };
        }),
        create: (_entity: any, o: any) => ({ ...o }),
      },
    };

    const order = await svc.createP2pSubOrder(callerRunner, {
      checkoutId: 'chk1',
      buyerId: 'b1',
      sellerId: 's1',
      amount: 15000,
      deliveryLocation: 'Main gate',
      lines: [
        { listingId: 'l1', title: 'Mini fridge', unitPrice: 10000 },
        { listingId: 'l2', title: 'Standing fan', unitPrice: 5000, offerId: 'o1' },
      ],
    });

    // sub-order shape
    expect(order.checkoutId).toBe('chk1');
    expect(order.market).toBe(OrderMarket.P2P);
    expect(order.deliveryMethod).toBe(DeliveryMethod.MEETUP);
    expect(order.deliveryLocation).toBe('Main gate');
    expect(order.itemsSubtotal).toBe(15000);
    expect(order.orderNumber).toMatch(/^ORD-\d{4}-000042$/);

    // one item row per line, snapshots carried
    const items = saved.filter((s: any) => s.titleSnapshot);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      listingId: 'l1',
      titleSnapshot: 'Mini fridge',
      unitPrice: 10000,
      lineTotal: 10000,
    });
    expect(items[1]).toMatchObject({ listingId: 'l2', offerId: 'o1' });
  });
});

describe('EscrowService.handleFulfillmentExpiry (72h delivery deadline)', () => {
  it('auto-refunds an order still in SELLER_READY at the deadline', async () => {
    const escrow: any = {
      id: 'e1',
      status: EscrowStatus.SELLER_READY,
      buyerId: 'b1',
      amount: 5000,
      listingId: 'l1',
      buyRequestOfferId: null,
    };
    const { svc, walletService } = buildService({ escrow });

    await svc.handleFulfillmentExpiry('e1');

    expect(walletService.refundFunds).toHaveBeenCalled();
    expect(escrow.status).toBe(EscrowStatus.EXPIRED);
  });

  it('skips an order that was already delivered', async () => {
    const escrow: any = {
      id: 'e1',
      status: EscrowStatus.DELIVERED,
      buyerId: 'b1',
      amount: 5000,
      listingId: 'l1',
      buyRequestOfferId: null,
    };
    const { svc, walletService } = buildService({ escrow });

    await svc.handleFulfillmentExpiry('e1');

    expect(walletService.refundFunds).not.toHaveBeenCalled();
    expect(escrow.status).toBe(EscrowStatus.DELIVERED);
  });
});

// ─── Phase 6: services — no-show, backstop, buyer-no-show fee (03.6) ──

const MIN = 60 * 1000;

function serviceEscrow(over: any = {}) {
  return {
    id: 'e1',
    buyerId: 'b1',
    sellerId: 'v1',
    orderNumber: 'ORD-2026-000700',
    status: EscrowStatus.SELLER_READY,
    amount: 5000,
    itemsSubtotal: 5000,
    deliveryFee: 0,
    market: OrderMarket.VENDOR,
    appointmentAt: new Date(Date.now() - 45 * MIN), // 45 min ago
    buyRequestOfferId: null,
    buyer: { universityId: 'u1' },
    ...over,
  };
}

describe('EscrowService.claimNoShow (vendor no-show, spec 03.6)', () => {
  it('is refused while the 30-minute grace is still running', async () => {
    const escrow = serviceEscrow({
      appointmentAt: new Date(Date.now() - 10 * MIN),
    });
    const { svc, walletService } = buildService({ escrow });

    await expect(svc.claimNoShow('e1', 'b1')).rejects.toThrow(/grace period/);
    expect(walletService.refundFunds).not.toHaveBeenCalled();
  });

  it('after the grace: full refund, CANCELLED/no_show, backstop job removed', async () => {
    const escrow = serviceEscrow();
    const { svc, walletService, escrowQueue } = buildService({ escrow });

    const result = await svc.claimNoShow('e1', 'b1');

    expect(walletService.refundFunds).toHaveBeenCalledWith(
      'b1',
      5000,
      'ESCROW_NO_SHOW_e1',
      expect.anything(),
      OrderMarket.VENDOR,
    );
    expect(result.status).toBe(EscrowStatus.CANCELLED);
    expect(result.cancelReason).toBe('no_show');
    expect(result.cancelledBy).toBe('buyer');
    expect(escrowQueue.remove).toHaveBeenCalledWith('appointment-backstop-e1');
  });

  it('only the buyer can claim, and only on an agreed service booking', async () => {
    const escrow = serviceEscrow();
    const { svc } = buildService({ escrow });
    await expect(svc.claimNoShow('e1', 'v1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    const goods = serviceEscrow({ appointmentAt: null });
    const { svc: svc2 } = buildService({ escrow: goods });
    await expect(svc2.claimNoShow('e1', 'b1')).rejects.toThrow(
      /agreed appointment/,
    );
  });
});

describe('EscrowService.handleAppointmentBackstop (appointment + 24h)', () => {
  it('expires an undelivered SELLER_READY booking with a full refund', async () => {
    const escrow = serviceEscrow();
    const { svc, walletService } = buildService({ escrow });

    await svc.handleAppointmentBackstop('e1');

    expect(walletService.refundFunds).toHaveBeenCalledWith(
      'b1',
      5000,
      'ESCROW_EXPIRED_e1',
      expect.anything(),
      OrderMarket.VENDOR,
    );
    expect(escrow.status).toBe(EscrowStatus.EXPIRED);
    expect(escrow.cancelReason).toBe('appointment_backstop');
  });

  it('skips a booking already delivered/verified', async () => {
    const escrow = serviceEscrow({ status: EscrowStatus.DELIVERED });
    const { svc, walletService } = buildService({ escrow });

    await svc.handleAppointmentBackstop('e1');

    expect(walletService.refundFunds).not.toHaveBeenCalled();
    expect(escrow.status).toBe(EscrowStatus.DELIVERED);
  });
});

describe('EscrowService.cancelEscrow — buyer no-show fee (spec FIG 03.4)', () => {
  it('vendor cancelling after appointment + grace charges the standard 10% fee (60/40)', async () => {
    const escrow = serviceEscrow();
    const { svc, walletService, platformWalletService } = buildService({
      escrow,
    });

    const result = await svc.cancelEscrow('e1', 'v1');

    // ₦5,000 × 10% = ₦500 → ₦300 vendor / ₦200 platform; buyer gets ₦4,500.
    expect(walletService.settleEscrow).toHaveBeenCalledWith(
      'b1',
      'v1',
      { total: 5000, toSeller: 300, toPlatform: 200 },
      'ESCROW_CANCEL_e1',
      expect.anything(),
      OrderMarket.VENDOR,
    );
    expect(platformWalletService.creditPlatformFee).toHaveBeenCalled();
    expect(result.cancellationFee).toBe(500);
    expect(result.refundAmount).toBe(4500);
    expect(result.sellerCompensation).toBe(300);
    expect(result.escrow.cancelReason).toBe('buyer_no_show');
    expect(result.escrow.cancelledBy).toBe('seller');
  });

  it('vendor cancelling before the appointment stays a free full refund', async () => {
    const escrow = serviceEscrow({
      appointmentAt: new Date(Date.now() + 24 * 60 * MIN), // tomorrow
    });
    const { svc, walletService } = buildService({ escrow });

    const result = await svc.cancelEscrow('e1', 'v1');

    expect(walletService.refundFunds).toHaveBeenCalled();
    expect(walletService.settleEscrow).not.toHaveBeenCalled();
    expect(result.cancellationFee).toBe(0);
    expect(result.refundAmount).toBe(5000);
    expect(result.escrow.cancelReason).toBe('seller_cancel');
  });
});
