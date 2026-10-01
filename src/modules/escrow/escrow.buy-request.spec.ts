import { BadRequestException } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { EscrowStatus, OrderMarket } from '../../database/entities/escrow.entity';
import { DeliveryMethod } from '../../database/entities/listing.entity';
import { VerificationTier } from '../../database/entities/user.entity';

/**
 * Buy-request escrows bypass checkout, so no meet-up point is snapshotted at
 * order time. Rev-2 dropped `deliveryLocation` from the seller-ready body,
 * which left these orders with no location at all: the buyer's notification
 * read "Collect your item at null". Now the escrow is created as a MEETUP
 * order and the seller must name the meet-up point when marking ready —
 * while checkout orders keep rejecting any attempt to change theirs.
 */
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

function makeService(escrow: any) {
  const escrowRepo: any = {
    findOne: jest.fn(async () => escrow),
    create: jest.fn((x: any) => ({ ...x })),
  };
  const deliveryCodeRepo: any = {
    create: jest.fn((x: any) => ({ id: 'dc1', ...x })),
  };
  const queryRunner: any = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    manager: { save: jest.fn(async (x: any) => (x.id ? x : { id: 'e-new', ...x })) },
  };
  const dataSource: any = {
    createQueryRunner: () => queryRunner,
    query: jest.fn(async () => [{ seq: 42 }]),
  };
  const escrowQueue: any = {
    add: jest.fn(async () => {}),
    remove: jest.fn(async () => {}),
  };
  const userRepo: any = {
    findOne: jest.fn(async ({ where }: any) => ({
      id: where.id,
      fullName: `User ${where.id}`,
      email: null,
      verificationTier: VerificationTier.TIER_1,
    })),
  };
  const walletService: any = {
    getBalance: jest.fn(async () => ({ availableBalance: 1_000_000 })),
    lockFunds: jest.fn(async () => {}),
  };
  const notificationsService: any = { createNotification: jest.fn(async () => ({})) };
  const resendService: any = { sendEmail: jest.fn(async () => {}) };

  // Constructor arg order per escrow.service.ts
  const svc = new EscrowService(
    escrowRepo,
    {} as any,
    deliveryCodeRepo,
    {} as any,
    {} as any,
    userRepo,
    {} as any,
    {} as any,
    walletService,
    {} as any,
    dataSource,
    escrowQueue,
    notificationsService,
    resendService,
    makeTimingPolicyStub(),
    {} as any,
  );
  return { svc, escrowRepo, deliveryCodeRepo, queryRunner, walletService, notificationsService };
}

/**
 * A meet-up tomorrow at 12:00 — the time the seller typed on their phone, i.e.
 * Lagos wall-clock (WAT, UTC+1, no DST). The expected instant is built with
 * that fixed offset, never with `setHours()`: that applies the test runner's
 * zone, which is UTC on GitHub Actions and WAT on a Nigerian laptop, so the
 * assertion would pass locally and fail in CI (or the reverse).
 */
function tomorrow(): { deliveryDate: string; deliveryTime: string; scheduledAt: Date } {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const deliveryDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
  const deliveryTime = '12:00';
  const scheduledAt = new Date(`${deliveryDate}T${deliveryTime}:00+01:00`);
  return { deliveryDate, deliveryTime, scheduledAt };
}

function makeEscrow(overrides: Partial<any> = {}): any {
  return {
    id: 'e1',
    sellerId: 's1',
    buyerId: 'b1',
    orderNumber: 'ORD-2026-000001',
    status: EscrowStatus.AWAITING_SELLER,
    market: OrderMarket.P2P,
    fulfillmentExpiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
    deliveryMethod: DeliveryMethod.MEETUP,
    deliveryLocation: null,
    deliveryDate: null,
    deliveryTime: null,
    ...overrides,
  };
}

describe('EscrowService.initiateEscrowFromOffer (buy-request order shape)', () => {
  it('creates a MEETUP P2P order with an explicit fee base and no snapshotted location', async () => {
    const { svc, escrowRepo, queryRunner, walletService } = makeService(null);
    const offer: any = {
      id: 'o1',
      requesterId: 'r1',
      responderId: 's1',
      proposedPrice: 15000,
      buyRequest: { title: 'Need a desk lamp' },
    };

    await svc.initiateEscrowFromOffer('r1', offer, queryRunner);

    expect(escrowRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        buyRequestOfferId: 'o1',
        market: OrderMarket.P2P,
        amount: 15000,
        itemsSubtotal: 15000,
        deliveryFee: 0,
        deliveryMethod: DeliveryMethod.MEETUP,
        status: EscrowStatus.AWAITING_SELLER,
      }),
    );
    expect(escrowRepo.create.mock.calls[0][0].deliveryLocation).toBeUndefined();
    expect(walletService.lockFunds).toHaveBeenCalledWith(
      'r1',
      15000,
      expect.stringMatching(/^ESCROW_/),
      queryRunner,
    );
  });
});

describe('EscrowService.initiateEscrowFromOffer — no side effects before commit', () => {
  it('does not enqueue jobs, notify, or email inside the caller\'s transaction', async () => {
    const { svc, queryRunner, notificationsService } = makeService(null);
    const escrowQueue = (svc as any).escrowQueue;
    const resendService = (svc as any).resendService;
    const offer: any = { id: 'o1', requesterId: 'r1', responderId: 's1', proposedPrice: 15000 };

    await svc.initiateEscrowFromOffer('r1', offer, queryRunner);

    expect(escrowQueue.add).not.toHaveBeenCalled();
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
    expect(resendService.sendEmail).not.toHaveBeenCalled();
  });
});

describe('EscrowService.finalizeOfferEscrowPlacement (post-commit)', () => {
  const escrow: any = {
    id: 'e-new',
    orderNumber: 'ORD-2026-000042',
    buyerId: 'r1',
    sellerId: 's1',
    amount: 15000,
  };
  const offer: any = { id: 'o1', buyRequest: { title: 'Need a desk lamp' } };

  it('schedules the deadline job and notifies both parties with the tailored copy', async () => {
    const { svc, notificationsService } = makeService(null);
    const escrowQueue = (svc as any).escrowQueue;

    await svc.finalizeOfferEscrowPlacement(escrow, offer);

    expect(escrowQueue.add).toHaveBeenCalledWith(
      expect.any(String),
      { escrowId: 'e-new' },
      expect.objectContaining({ jobId: 'fulfillment-expiry-e-new' }),
    );
    const notices = notificationsService.createNotification.mock.calls.map(([p]: any[]) => p);
    expect(notices.find((p: any) => p.userId === 'r1').title).toBe('Order confirmed');
    expect(notices.find((p: any) => p.userId === 's1').title).toBe('Your offer was accepted!');
    expect(notices.find((p: any) => p.userId === 's1').body).toContain('Need a desk lamp');
  });

  it('never throws — the money has already moved', async () => {
    const { svc } = makeService(null);
    (svc as any).escrowQueue.add.mockRejectedValueOnce(new Error('redis down'));

    await expect(svc.finalizeOfferEscrowPlacement(escrow, offer)).resolves.toBeUndefined();
  });
});

describe('EscrowService.sellerReady — buy-request escrow (no snapshotted meet-up point)', () => {
  it('requires the seller to name the meet-up location', async () => {
    const { svc, queryRunner } = makeService(makeEscrow());
    const { deliveryDate, deliveryTime } = tomorrow();

    await expect(
      svc.sellerReady('e1', 's1', { deliveryDate, deliveryTime }),
    ).rejects.toThrow(/meet-up location is required/i);
    expect(queryRunner.startTransaction).not.toHaveBeenCalled();
  });

  it('still requires a date and time (meet-up rules apply)', async () => {
    const { svc } = makeService(makeEscrow());

    await expect(
      svc.sellerReady('e1', 's1', { deliveryLocation: 'Main gate' }),
    ).rejects.toThrow(/date and time are required/i);
  });

  it('stores the location, marks ready, and issues a ±2h code around the meet-up', async () => {
    const escrow = makeEscrow();
    const { svc, deliveryCodeRepo, notificationsService } = makeService(escrow);
    const { deliveryDate, deliveryTime, scheduledAt } = tomorrow();

    const result = await svc.sellerReady('e1', 's1', {
      deliveryDate,
      deliveryTime,
      deliveryLocation: '  Faculty of Engineering, main gate  ',
    });

    expect(result.escrow.status).toBe(EscrowStatus.SELLER_READY);
    expect(result.escrow.deliveryMethod).toBe(DeliveryMethod.MEETUP);
    expect(result.escrow.deliveryLocation).toBe('Faculty of Engineering, main gate');
    expect(result.escrow.deliveryTime).toBe(deliveryTime);

    const code = deliveryCodeRepo.create.mock.calls[0][0];
    expect(code.validFrom.getTime()).toBe(scheduledAt.getTime() - 2 * 60 * 60 * 1000);
    expect(code.validUntil.getTime()).toBe(scheduledAt.getTime() + 2 * 60 * 60 * 1000);

    // The buyer is finally told WHERE
    const notice = notificationsService.createNotification.mock.calls[0][0];
    expect(notice.userId).toBe('b1');
    expect(notice.body).toContain('Faculty of Engineering, main gate');
    expect(notice.body).not.toContain('null');
    expect(notice.data.deliveryLocation).toBe('Faculty of Engineering, main gate');
  });

  it('treats a legacy null-method buy-request escrow as meet-up too', async () => {
    const escrow = makeEscrow({ deliveryMethod: null });
    const { svc } = makeService(escrow);
    const { deliveryDate, deliveryTime } = tomorrow();

    await expect(svc.sellerReady('e1', 's1', {})).rejects.toBeInstanceOf(BadRequestException);

    const result = await svc.sellerReady('e1', 's1', {
      deliveryDate,
      deliveryTime,
      deliveryLocation: 'Library steps',
    });
    expect(result.escrow.deliveryMethod).toBe(DeliveryMethod.MEETUP);
    expect(result.escrow.deliveryLocation).toBe('Library steps');
  });
});

describe('EscrowService.sellerReady — checkout orders keep their snapshotted location', () => {
  it('rejects an attempt to change the buyer-chosen meet-up point', async () => {
    const { svc } = makeService(makeEscrow({ deliveryLocation: 'Library steps' }));
    const { deliveryDate, deliveryTime } = tomorrow();

    await expect(
      svc.sellerReady('e1', 's1', { deliveryDate, deliveryTime, deliveryLocation: 'My hostel' }),
    ).rejects.toThrow(/fixed at order time/i);
  });

  it('works as before with date and time only', async () => {
    const { svc } = makeService(makeEscrow({ deliveryLocation: 'Library steps' }));
    const { deliveryDate, deliveryTime } = tomorrow();

    const result = await svc.sellerReady('e1', 's1', { deliveryDate, deliveryTime });

    expect(result.escrow.status).toBe(EscrowStatus.SELLER_READY);
    expect(result.escrow.deliveryLocation).toBe('Library steps');
  });

  it('leaves vendor door-delivery orders untouched (no schedule, no location change)', async () => {
    const escrow = makeEscrow({
      market: OrderMarket.VENDOR,
      deliveryMethod: DeliveryMethod.DELIVERY,
      deliveryLocation: 'Room 12, Moremi Hall',
    });
    const { svc } = makeService(escrow);

    const result = await svc.sellerReady('e1', 's1', {});

    expect(result.escrow.status).toBe(EscrowStatus.SELLER_READY);
    expect(result.escrow.deliveryMethod).toBe(DeliveryMethod.DELIVERY);
    expect(result.escrow.deliveryLocation).toBe('Room 12, Moremi Hall');
  });
});
