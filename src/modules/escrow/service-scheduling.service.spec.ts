import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ServiceSchedulingService } from './service-scheduling.service';
import { EscrowStatus } from '../../database/entities/escrow.entity';
import { OrderItemType } from '../../database/entities/order-item.entity';
import {
  ProposalParty,
  ProposalStatus,
} from '../../database/entities/service-time-proposal.entity';

/**
 * Appointment negotiation (rev-2 spec 03.6): strict turn-taking on the open
 * proposal, accept re-keys the order, reject terminates free, counters
 * supersede with a 48h table-life inside the untouched 72h agreement window.
 */
const HOUR = 60 * 60 * 1000;

function order(over: any = {}) {
  return {
    id: 'ord1',
    orderNumber: 'ORD-2026-000900',
    buyerId: 'buyer',
    sellerId: 'vendor',
    status: EscrowStatus.PENDING_CONFIRMATION,
    appointmentAt: null,
    agreedAt: null,
    createdAt: new Date(),
    orderItems: [
      {
        itemType: OrderItemType.VENDOR_SERVICE,
        vendorListingId: 'vs1',
      },
    ],
    ...over,
  };
}

function proposal(over: any = {}) {
  return {
    id: 'prop1',
    orderId: 'ord1',
    proposedBy: ProposalParty.BUYER,
    proposedTime: new Date(Date.now() + 48 * HOUR),
    message: null,
    status: ProposalStatus.PENDING,
    expiresAt: new Date(Date.now() + 48 * HOUR),
    createdAt: new Date(),
    ...over,
  };
}

function makeService(opts: { order?: any; proposal?: any | null } = {}) {
  const theOrder = opts.order === undefined ? order() : opts.order;
  const theProposal =
    opts.proposal === undefined ? proposal() : opts.proposal;

  const proposalRepo: any = {
    findOne: jest.fn(async () => theProposal),
    find: jest.fn(async () => (theProposal ? [theProposal] : [])),
    save: jest.fn(async (x: any) => x),
    create: (x: any) => ({ id: 'prop-new', ...x }),
  };
  const escrowRepo: any = {
    findOne: jest.fn(async () => theOrder),
  };
  const escrowService: any = {
    activateServiceAppointment: jest.fn(async (id: string, at: Date) => ({
      escrow: { ...theOrder, id, status: EscrowStatus.SELLER_READY, appointmentAt: at },
      deliveryCode: {
        code: '1234',
        validFrom: new Date(at.getTime() - 2 * HOUR),
        validUntil: new Date(at.getTime() + 24 * HOUR),
      },
    })),
    rejectOrder: jest.fn(async () => ({
      ...theOrder,
      status: EscrowStatus.CANCELLED,
    })),
    cancelEscrow: jest.fn(async () => ({
      escrow: { ...theOrder, status: EscrowStatus.CANCELLED },
      cancellationFee: 0,
      refundAmount: 5000,
      sellerCompensation: 0,
    })),
  };
  const notificationsService: any = {
    createNotification: jest.fn(async () => ({})),
  };
  const timingPolicy: any = {
    resolve: () => ({
      agreementHours: 72,
      appointmentHorizonDays: 14,
      noShowGraceMinutes: 30,
      appointmentBackstopHours: 24,
      proposalExpiryHours: 48,
    }),
  };
  const availability: any = { assertAvailable: jest.fn(async () => {}) };

  const svc = new ServiceSchedulingService(
    proposalRepo,
    escrowRepo,
    escrowService,
    notificationsService,
    timingPolicy,
    availability,
  );
  return {
    svc,
    proposalRepo,
    escrowRepo,
    escrowService,
    notificationsService,
    availability,
    theOrder,
    theProposal,
  };
}

describe('ServiceSchedulingService.respond — guards', () => {
  it('404s on a missing order and 403s a stranger', async () => {
    const missing = makeService({ order: null });
    await expect(
      missing.svc.respond('ord1', 'buyer', { action: 'accept' } as any),
    ).rejects.toThrow(NotFoundException);

    const { svc } = makeService();
    await expect(
      svc.respond('ord1', 'someone-else', { action: 'accept' } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects non-service orders and closed negotiations', async () => {
    const goods = makeService({
      order: order({
        orderItems: [{ itemType: OrderItemType.VENDOR_GOODS, vendorListingId: 'vg1' }],
      }),
    });
    await expect(
      goods.svc.respond('ord1', 'vendor', { action: 'accept' } as any),
    ).rejects.toThrow(/not a service booking/);

    const closed = makeService({
      order: order({ status: EscrowStatus.SELLER_READY }),
    });
    await expect(
      closed.svc.respond('ord1', 'vendor', { action: 'accept' } as any),
    ).rejects.toThrow(/negotiation is closed/);
  });

  it('enforces turn-taking: the proposer cannot answer their own proposal', async () => {
    const { svc } = makeService(); // pending proposal is the BUYER's
    await expect(
      svc.respond('ord1', 'buyer', { action: 'accept' } as any),
    ).rejects.toThrow(/other party/);
  });

  it('400s when there is no open proposal', async () => {
    const { svc } = makeService({ proposal: null });
    await expect(
      svc.respond('ord1', 'vendor', { action: 'accept' } as any),
    ).rejects.toThrow(/no open time proposal/);
  });
});

describe('ServiceSchedulingService.respond — accept', () => {
  it('accepts: proposal ACCEPTED, order re-keyed via activateServiceAppointment, code window returned (never the code)', async () => {
    const { svc, escrowService, availability, theProposal } = makeService();

    const result = await svc.respond('ord1', 'vendor', {
      action: 'accept',
    } as any);

    expect(theProposal.status).toBe(ProposalStatus.ACCEPTED);
    expect(escrowService.activateServiceAppointment).toHaveBeenCalledWith(
      'ord1',
      new Date(theProposal.proposedTime),
    );
    expect(availability.assertAvailable).toHaveBeenCalled();
    expect(result.codeWindow).toBeDefined();
    expect((result as any).codeWindow.code).toBeUndefined();
    expect(result.order.status).toBe(EscrowStatus.SELLER_READY);
  });

  it('an expired proposal cannot be accepted — it flips to EXPIRED', async () => {
    const stale = proposal({ expiresAt: new Date(Date.now() - HOUR) });
    const { svc, proposalRepo } = makeService({ proposal: stale });

    await expect(
      svc.respond('ord1', 'vendor', { action: 'accept' } as any),
    ).rejects.toThrow(/expired/);
    expect(stale.status).toBe(ProposalStatus.EXPIRED);
    expect(proposalRepo.save).toHaveBeenCalledWith(stale);
  });

  it('a proposed time already in the past cannot be accepted', async () => {
    const past = proposal({
      proposedTime: new Date(Date.now() - HOUR),
      expiresAt: new Date(Date.now() + 40 * HOUR),
    });
    const { svc } = makeService({ proposal: past });

    await expect(
      svc.respond('ord1', 'vendor', { action: 'accept' } as any),
    ).rejects.toThrow(/already passed/);
  });
});

describe('ServiceSchedulingService.respond — reject', () => {
  it('vendor reject terminates via rejectOrder (free full refund)', async () => {
    const { svc, escrowService, theProposal } = makeService();

    const result = await svc.respond('ord1', 'vendor', {
      action: 'reject',
      message: 'Fully booked that week',
    } as any);

    expect(theProposal.status).toBe(ProposalStatus.REJECTED);
    expect(escrowService.rejectOrder).toHaveBeenCalledWith(
      'ord1',
      'vendor',
      'Fully booked that week',
    );
    expect(result.order.status).toBe(EscrowStatus.CANCELLED);
  });

  it('buyer reject of a vendor counter terminates via the free pending cancel', async () => {
    const vendorCounter = proposal({ proposedBy: ProposalParty.VENDOR });
    const { svc, escrowService } = makeService({ proposal: vendorCounter });

    await svc.respond('ord1', 'buyer', { action: 'reject' } as any);

    expect(vendorCounter.status).toBe(ProposalStatus.REJECTED);
    expect(escrowService.cancelEscrow).toHaveBeenCalledWith('ord1', 'buyer');
  });
});

describe('ServiceSchedulingService.respond — counter', () => {
  it('supersedes the open proposal and lays a fresh 48h one from the responder', async () => {
    const { svc, proposalRepo, notificationsService, availability, theProposal } =
      makeService();
    const newTime = new Date(Date.now() + 72 * HOUR);

    const result = await svc.respond('ord1', 'vendor', {
      action: 'counter',
      proposedTime: newTime.toISOString(),
      message: 'Morning works better',
    } as any);

    expect(theProposal.status).toBe(ProposalStatus.SUPERSEDED);
    const created = proposalRepo.save.mock.calls
      .map((c: any[]) => c[0])
      .find((p: any) => p.id === 'prop-new');
    expect(created.proposedBy).toBe(ProposalParty.VENDOR);
    expect(created.status).toBe(ProposalStatus.PENDING);
    expect(created.proposedTime.toISOString()).toBe(newTime.toISOString());
    const tableLifeMs =
      created.expiresAt.getTime() - Date.now();
    expect(tableLifeMs).toBeGreaterThan(47 * HOUR);
    expect(tableLifeMs).toBeLessThanOrEqual(48 * HOUR);
    expect(availability.assertAvailable).toHaveBeenCalled();
    // The buyer (counterparty) hears about it.
    expect(
      notificationsService.createNotification.mock.calls[0][0].userId,
    ).toBe('buyer');
    expect(result.proposal.id).toBe('prop-new');
  });

  it('a counter needs a valid future time inside 14 days of the ORDER', async () => {
    const { svc } = makeService();

    await expect(
      svc.respond('ord1', 'vendor', { action: 'counter' } as any),
    ).rejects.toThrow(/needs a proposedTime/);

    await expect(
      svc.respond('ord1', 'vendor', {
        action: 'counter',
        proposedTime: new Date(Date.now() - HOUR).toISOString(),
      } as any),
    ).rejects.toThrow(/in the future/);

    await expect(
      svc.respond('ord1', 'vendor', {
        action: 'counter',
        proposedTime: new Date(Date.now() + 15 * 24 * HOUR).toISOString(),
      } as any),
    ).rejects.toThrow(/at most 14 days/);
  });

  it('the horizon anchors to order creation, not to now', async () => {
    // Order created 13 days ago → only ~1 day of horizon left.
    const oldOrder = order({
      createdAt: new Date(Date.now() - 13 * 24 * HOUR),
    });
    const { svc } = makeService({ order: oldOrder });

    await expect(
      svc.respond('ord1', 'vendor', {
        action: 'counter',
        proposedTime: new Date(Date.now() + 2 * 24 * HOUR).toISOString(),
      } as any),
    ).rejects.toThrow(/at most 14 days/);
  });

  it('an expired open proposal can still be countered (only accept is blocked)', async () => {
    const stale = proposal({ expiresAt: new Date(Date.now() - HOUR) });
    const { svc, proposalRepo } = makeService({ proposal: stale });

    const result = await svc.respond('ord1', 'vendor', {
      action: 'counter',
      proposedTime: new Date(Date.now() + 24 * HOUR).toISOString(),
    } as any);

    expect(stale.status).toBe(ProposalStatus.SUPERSEDED);
    expect(result.proposal.id).toBe('prop-new');
    expect(proposalRepo.save).toHaveBeenCalled();
  });
});

describe('ServiceSchedulingService.getSchedule', () => {
  it('returns the negotiation trail to a party', async () => {
    const { svc, theProposal } = makeService();
    const view = await svc.getSchedule('ord1', 'buyer');
    expect(view.orderId).toBe('ord1');
    expect(view.status).toBe(EscrowStatus.PENDING_CONFIRMATION);
    expect(view.proposals).toEqual([theProposal]);
  });

  it('is party-scoped', async () => {
    const { svc } = makeService();
    await expect(svc.getSchedule('ord1', 'nosy')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
