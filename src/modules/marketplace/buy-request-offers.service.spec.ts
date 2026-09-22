import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  BuyRequestOffersService,
  BUY_REQUEST_OFFER_EXPIRY_DAYS,
} from './buy-request-offers.service';
import {
  BuyRequestOffer,
  BuyRequestOfferStatus,
} from '../../database/entities/buy-request-offer.entity';
import {
  BuyRequest,
  BuyRequestStatus,
} from '../../database/entities/buy-request.entity';
import { Conversation } from '../../database/entities/conversation.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { BuyRequestOfferResponseAction } from './dto';

/**
 * Accepting a buy-request offer is one transaction: request OPEN→FULFILLED and
 * offer PENDING→ACCEPTED via CONDITIONAL updates (0 rows = someone got there
 * first), every sibling PENDING offer rejected in the same transaction, escrow
 * created. Before this, a cancelled request could still be accepted into (the
 * request flipped cancelled→fulfilled and an escrow was created), and the
 * sibling rejection ran outside the transaction.
 */
function makeOffer(overrides: Partial<any> = {}): any {
  return {
    id: 'o1',
    buyRequestId: 'br1',
    responderId: 's1',
    requesterId: 'r1',
    proposedPrice: 15000,
    status: BuyRequestOfferStatus.PENDING,
    expiresAt: new Date(Date.now() + 60_000),
    conversationId: 'c1',
    buyRequest: { id: 'br1', title: 'Need a desk lamp', status: BuyRequestStatus.OPEN },
    ...overrides,
  };
}

function makeSibling(id: string, responderId: string, conversationId: string | null): any {
  return {
    id,
    buyRequestId: 'br1',
    responderId,
    requesterId: 'r1',
    status: BuyRequestOfferStatus.PENDING,
    conversationId,
    buyRequest: { id: 'br1', title: 'Need a desk lamp' },
  };
}

function makeService(
  offer: any,
  opts: {
    requestFlipAffected?: number;
    offerFlipAffected?: number;
    siblings?: any[];
    buyRequest?: any;
    existingConversation?: any;
    expired?: any[];
  } = {},
) {
  const siblings = opts.siblings ?? [];
  const saved: any[] = [];
  const manager: any = {
    update: jest.fn(async (entity: any, criteria: any) => {
      if (entity === BuyRequest) return { affected: opts.requestFlipAffected ?? 1 };
      if (entity === BuyRequestOffer && criteria?.id === offer?.id) {
        return { affected: opts.offerFlipAffected ?? 1 };
      }
      return { affected: siblings.length };
    }),
    find: jest.fn(async () => siblings),
    findOne: jest.fn(async () => opts.existingConversation ?? null),
    create: jest.fn((_entity: any, data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      const row = { id: data.id ?? `saved-${saved.length + 1}`, ...data };
      saved.push(row);
      return row;
    }),
  };
  const queryRunner: any = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    manager,
  };
  const offerRepository: any = {
    findOne: jest.fn(async () => offer),
    find: jest.fn(async () => opts.expired ?? []),
    update: jest.fn(async () => ({ affected: (opts.expired ?? []).length || 1 })),
  };
  const buyRequestRepository: any = { findOne: jest.fn(async () => opts.buyRequest ?? null) };
  const userRepository: any = {
    findOne: jest.fn(async ({ where }: any) => ({ id: where.id, fullName: `User ${where.id}` })),
  };
  const chatService: any = {
    sendSystemMessage: jest.fn(async () => ({})),
    sendMessage: jest.fn(async () => ({})),
  };
  const escrowService: any = {
    initiateEscrowFromOffer: jest.fn(async () => ({ id: 'e1' })),
    finalizeOfferEscrowPlacement: jest.fn(async () => {}),
  };
  const notificationsService: any = { createNotification: jest.fn(async () => ({})) };
  const transactionPinService: any = { verifyForTransaction: jest.fn(async () => {}) };
  const dataSource: any = { createQueryRunner: jest.fn(() => queryRunner) };

  const svc = new BuyRequestOffersService(
    offerRepository,
    buyRequestRepository,
    {} as any,
    userRepository,
    chatService,
    escrowService,
    notificationsService,
    transactionPinService,
    dataSource,
  );
  return {
    svc,
    manager,
    saved,
    queryRunner,
    offerRepository,
    chatService,
    escrowService,
    notificationsService,
    dataSource,
  };
}

const accept = { action: BuyRequestOfferResponseAction.ACCEPT, pin: '123456' } as any;

describe('BuyRequestOffersService.respondToOffer — accept', () => {
  it('refuses an offer on a cancelled request before touching the DB', async () => {
    const offer = makeOffer({
      buyRequest: { id: 'br1', title: 'x', status: BuyRequestStatus.CANCELLED },
    });
    const { svc, dataSource, escrowService } = makeService(offer);

    await expect(svc.respondToOffer('o1', 'r1', accept)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(escrowService.initiateEscrowFromOffer).not.toHaveBeenCalled();
  });

  it('refuses an offer on an already-fulfilled request', async () => {
    const offer = makeOffer({
      buyRequest: { id: 'br1', title: 'x', status: BuyRequestStatus.FULFILLED },
    });
    const { svc } = makeService(offer);

    await expect(svc.respondToOffer('o1', 'r1', accept)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('flips request and offer conditionally, rejects siblings in the SAME transaction, then notifies the losers', async () => {
    const offer = makeOffer();
    const siblings = [makeSibling('o2', 's2', 'c2'), makeSibling('o3', 's3', null)];
    const { svc, manager, queryRunner, escrowService, chatService, notificationsService } =
      makeService(offer, { siblings });

    await svc.respondToOffer('o1', 'r1', accept);

    // Conditional flips — WHERE status guards make concurrent accepts lose
    expect(manager.update).toHaveBeenCalledWith(
      BuyRequest,
      { id: 'br1', status: BuyRequestStatus.OPEN },
      { status: BuyRequestStatus.FULFILLED },
    );
    expect(manager.update).toHaveBeenCalledWith(
      BuyRequestOffer,
      { id: 'o1', status: BuyRequestOfferStatus.PENDING },
      expect.objectContaining({ status: BuyRequestOfferStatus.ACCEPTED }),
    );

    // Siblings looked up and rejected on the transaction's manager
    expect(manager.find).toHaveBeenCalledWith(
      BuyRequestOffer,
      expect.objectContaining({
        where: expect.objectContaining({
          buyRequestId: 'br1',
          status: BuyRequestOfferStatus.PENDING,
        }),
      }),
    );
    const siblingUpdate = manager.update.mock.calls.find(
      ([entity, criteria]: any[]) => entity === BuyRequestOffer && criteria.id !== 'o1',
    );
    expect(siblingUpdate).toBeDefined();
    expect(siblingUpdate[1].id.value).toEqual(['o2', 'o3']);
    expect(siblingUpdate[1].status).toBe(BuyRequestOfferStatus.PENDING);
    expect(siblingUpdate[2]).toEqual(
      expect.objectContaining({ status: BuyRequestOfferStatus.REJECTED }),
    );

    // Everything above happened before commit; escrow inside the tx too
    const commitAt = queryRunner.commitTransaction.mock.invocationCallOrder[0];
    for (const order of manager.update.mock.invocationCallOrder) {
      expect(order).toBeLessThan(commitAt);
    }
    expect(escrowService.initiateEscrowFromOffer).toHaveBeenCalledWith('r1', offer, queryRunner);
    expect(escrowService.initiateEscrowFromOffer.mock.invocationCallOrder[0]).toBeLessThan(
      commitAt,
    );
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();

    // Order jobs / notifications / emails only AFTER commit, with the new escrow
    expect(escrowService.finalizeOfferEscrowPlacement).toHaveBeenCalledWith({ id: 'e1' }, offer);
    expect(escrowService.finalizeOfferEscrowPlacement.mock.invocationCallOrder[0]).toBeGreaterThan(
      commitAt,
    );

    // Losers notified AFTER commit: system line where a thread exists, push for all
    expect(chatService.sendSystemMessage).toHaveBeenCalledTimes(1);
    expect(chatService.sendSystemMessage).toHaveBeenCalledWith(
      'c2',
      expect.stringContaining('fulfilled with another offer'),
      expect.objectContaining({ type: 'request_fulfilled', offerId: 'o2' }),
    );
    const rejectedNotices = notificationsService.createNotification.mock.calls
      .map(([p]: any[]) => p)
      .filter((p: any) => p.type === NotificationType.OFFER_REJECTED);
    expect(rejectedNotices.map((p: any) => p.userId).sort()).toEqual(['s2', 's3']);
    for (const order of notificationsService.createNotification.mock.invocationCallOrder) {
      expect(order).toBeGreaterThan(commitAt);
    }
  });

  it('loses the race when the request was closed meanwhile: Conflict, rollback, no escrow, no notices', async () => {
    const offer = makeOffer();
    const siblings = [makeSibling('o2', 's2', 'c2')];
    const { svc, queryRunner, escrowService, chatService, notificationsService } = makeService(
      offer,
      { requestFlipAffected: 0, siblings },
    );

    await expect(svc.respondToOffer('o1', 'r1', accept)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(escrowService.initiateEscrowFromOffer).not.toHaveBeenCalled();
    expect(escrowService.finalizeOfferEscrowPlacement).not.toHaveBeenCalled();
    expect(chatService.sendSystemMessage).not.toHaveBeenCalled();
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('loses the race when the offer was decided meanwhile', async () => {
    const offer = makeOffer();
    const { svc, queryRunner, escrowService } = makeService(offer, { offerFlipAffected: 0 });

    await expect(svc.respondToOffer('o1', 'r1', accept)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(escrowService.initiateEscrowFromOffer).not.toHaveBeenCalled();
  });

  it('rolls back everything when escrow creation fails (e.g. insufficient balance)', async () => {
    const offer = makeOffer();
    const { svc, queryRunner, escrowService, notificationsService } = makeService(offer, {
      siblings: [makeSibling('o2', 's2', 'c2')],
    });
    escrowService.initiateEscrowFromOffer.mockRejectedValueOnce(
      new BadRequestException('Insufficient balance'),
    );

    await expect(svc.respondToOffer('o1', 'r1', accept)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('never fails an accept because a loser could not be notified', async () => {
    const offer = makeOffer();
    const { svc, queryRunner, chatService } = makeService(offer, {
      siblings: [makeSibling('o2', 's2', 'c2')],
    });
    chatService.sendSystemMessage.mockRejectedValueOnce(new Error('chat down'));

    await expect(svc.respondToOffer('o1', 'r1', accept)).resolves.toBeDefined();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('still pushes the notification when the chat system message fails (channels are independent)', async () => {
    const offer = makeOffer();
    const { svc, chatService, notificationsService } = makeService(offer, {
      siblings: [makeSibling('o2', 's2', 'c2')],
    });
    chatService.sendSystemMessage.mockRejectedValueOnce(new Error('chat down'));

    await svc.respondToOffer('o1', 'r1', accept);

    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 's2', type: NotificationType.OFFER_REJECTED }),
    );
  });
});

describe('BuyRequestOffersService.respondToOffer — reject', () => {
  it('marks the offer rejected and notifies the responder', async () => {
    const offer = makeOffer();
    const { svc, offerRepository, chatService, notificationsService, dataSource } =
      makeService(offer);

    await svc.respondToOffer('o1', 'r1', {
      action: BuyRequestOfferResponseAction.REJECT,
      message: 'Too pricey',
    } as any);

    expect(offerRepository.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ status: BuyRequestOfferStatus.REJECTED }),
    );
    expect(chatService.sendSystemMessage).toHaveBeenCalledWith(
      'c1',
      'Offer declined: Too pricey',
      expect.objectContaining({ type: 'offer_rejected' }),
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 's1', type: NotificationType.OFFER_REJECTED }),
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});

describe('BuyRequestOffersService.createOffer', () => {
  const openRequest = (overrides: Partial<any> = {}) => ({
    id: 'br1',
    requesterId: 'r1',
    title: 'Need a desk lamp',
    status: BuyRequestStatus.OPEN,
    budgetMin: 5000,
    budgetMax: 20000,
    ...overrides,
  });
  const dto = (proposedPrice: number, message?: string): any => ({
    proposedPrice,
    itemCondition: 'used_good',
    message,
  });

  it('caps a fixed-budget request (no budgetMax) at budgetMin', async () => {
    const { svc, dataSource } = makeService(null, {
      buyRequest: openRequest({ budgetMin: 8000, budgetMax: null }),
    });

    await expect(svc.createOffer('s1', 'br1', dto(8001))).rejects.toThrow(/budget of ₦8,000/);
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('still caps a range at budgetMax and allows anything below it', async () => {
    const over = makeService(null, { buyRequest: openRequest() });
    await expect(over.svc.createOffer('s1', 'br1', dto(20001))).rejects.toThrow(
      /maximum budget of ₦20,000/,
    );

    const under = makeService(null, { buyRequest: openRequest() });
    under.offerRepository.findOne = jest
      .fn()
      .mockResolvedValueOnce(null) // duplicate-pending check
      .mockResolvedValue({ id: 'saved-2', responderId: 's1', requesterId: 'r1' }); // getOfferById
    await expect(under.svc.createOffer('s1', 'br1', dto(1000))).resolves.toBeDefined();
  });

  it('creates the conversation and the offer in ONE transaction, then notifies + posts the opening message best-effort', async () => {
    const { svc, manager, saved, queryRunner, notificationsService, chatService, offerRepository } =
      makeService(null, { buyRequest: openRequest() });
    offerRepository.findOne = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'saved-2', responderId: 's1', requesterId: 'r1' });
    chatService.sendMessage.mockRejectedValueOnce(new Error('chat down'));

    await svc.createOffer('s1', 'br1', dto(15000, 'Dell Latitude, 8GB'));

    // Both rows saved through the transaction's manager, conversation first
    expect(manager.findOne).toHaveBeenCalledWith(
      Conversation,
      expect.objectContaining({ where: { buyRequestId: 'br1', buyerId: 's1' } }),
    );
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(
      expect.objectContaining({ buyRequestId: 'br1', buyerId: 's1', participant2Id: 'r1' }),
    );
    expect(saved[1]).toEqual(
      expect.objectContaining({
        buyRequestId: 'br1',
        responderId: 's1',
        requesterId: 'r1',
        proposedPrice: 15000,
        status: BuyRequestOfferStatus.PENDING,
        conversationId: saved[0].id,
      }),
    );
    // The requester gets a WEEK to respond (listing offers expire in 48h)
    const ttlMs = saved[1].expiresAt.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(BUY_REQUEST_OFFER_EXPIRY_DAYS * 24 * 3600 * 1000 - 60_000);
    expect(ttlMs).toBeLessThanOrEqual(BUY_REQUEST_OFFER_EXPIRY_DAYS * 24 * 3600 * 1000);
    expect(BUY_REQUEST_OFFER_EXPIRY_DAYS).toBe(7);
    const commitAt = queryRunner.commitTransaction.mock.invocationCallOrder[0];
    for (const order of manager.save.mock.invocationCallOrder) expect(order).toBeLessThan(commitAt);

    // Side effects after commit; the failed chat message did not fail the offer
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'r1', type: NotificationType.OFFER_RECEIVED }),
    );
    expect(notificationsService.createNotification.mock.invocationCallOrder[0]).toBeGreaterThan(
      commitAt,
    );
    expect(chatService.sendMessage).toHaveBeenCalled();
  });

  it('reuses an existing conversation for the same responder + request', async () => {
    const { svc, saved, offerRepository } = makeService(null, {
      buyRequest: openRequest(),
      existingConversation: { id: 'c-existing' },
    });
    offerRepository.findOne = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'saved-1', responderId: 's1', requesterId: 'r1' });

    await svc.createOffer('s1', 'br1', dto(15000));

    expect(saved).toHaveLength(1);
    expect(saved[0].conversationId).toBe('c-existing');
  });

  it('rolls back when the offer cannot be saved — no orphan conversation', async () => {
    const { svc, manager, queryRunner, notificationsService } = makeService(null, {
      buyRequest: openRequest(),
    });
    manager.save = jest
      .fn()
      .mockResolvedValueOnce({ id: 'c1' })
      .mockRejectedValueOnce(new Error('db down'));

    await expect(svc.createOffer('s1', 'br1', dto(15000))).rejects.toThrow('db down');
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });
});

describe('BuyRequestOffersService.markExpiredOffers (sweep)', () => {
  it('returns 0 and touches nothing when no offer is overdue', async () => {
    const { svc, offerRepository, notificationsService } = makeService(null, { expired: [] });

    expect(await svc.markExpiredOffers()).toBe(0);
    expect(offerRepository.update).not.toHaveBeenCalled();
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('flips overdue PENDING offers to EXPIRED and tells each responder (push + thread line)', async () => {
    const expired = [
      { id: 'o1', responderId: 's1', buyRequestId: 'br1', conversationId: 'c1', buyRequest: { title: 'Need a lamp' } },
      { id: 'o2', responderId: 's2', buyRequestId: 'br1', conversationId: null, buyRequest: { title: 'Need a lamp' } },
    ];
    const { svc, offerRepository, notificationsService, chatService } = makeService(null, {
      expired,
    });
    chatService.sendSystemMessage.mockRejectedValueOnce(new Error('chat down'));

    const count = await svc.markExpiredOffers();

    expect(count).toBe(2);
    expect(offerRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: BuyRequestOfferStatus.PENDING }),
      }),
    );
    const [criteria, patch] = offerRepository.update.mock.calls[0];
    expect(criteria.id.value).toEqual(['o1', 'o2']);
    expect(criteria.status).toBe(BuyRequestOfferStatus.PENDING);
    expect(patch).toEqual({ status: BuyRequestOfferStatus.EXPIRED });

    const notified = notificationsService.createNotification.mock.calls.map(([p]: any[]) => p);
    expect(notified.map((p: any) => p.userId).sort()).toEqual(['s1', 's2']);
    expect(notified.every((p: any) => p.type === NotificationType.OFFER_EXPIRED)).toBe(true);
    // Only the offer with a thread gets a system line; its failure is swallowed
    expect(chatService.sendSystemMessage).toHaveBeenCalledTimes(1);
  });
});

describe('BuyRequestOffersService.getResponderOffers', () => {
  it('narrows to one buy request when buyRequestId is given (detail page: "my offer here")', async () => {
    const { svc, offerRepository } = makeService(null);
    offerRepository.findAndCount = jest.fn(async () => [[], 0]);

    await svc.getResponderOffers('s1', undefined, 1, 20, 'br1');

    expect(offerRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { responderId: 's1', buyRequestId: 'br1' } }),
    );
  });

  it('leaves the request filter out when not given', async () => {
    const { svc, offerRepository } = makeService(null);
    offerRepository.findAndCount = jest.fn(async () => [[], 0]);

    await svc.getResponderOffers('s1', BuyRequestOfferStatus.PENDING, 2, 10);

    expect(offerRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { responderId: 's1', status: BuyRequestOfferStatus.PENDING },
        skip: 10,
        take: 10,
      }),
    );
  });
});

describe('BuyRequestOffersService.rejectPendingOffersForRequest', () => {
  it('returns [] and issues no update when nothing is pending', async () => {
    const { svc, manager } = makeService(makeOffer(), { siblings: [] });

    const result = await svc.rejectPendingOffersForRequest('br1', new Date(), manager);

    expect(result).toEqual([]);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects every pending offer when no winner is spared (cancel / manual fulfil)', async () => {
    const siblings = [makeSibling('o2', 's2', 'c2'), makeSibling('o3', 's3', 'c3')];
    const { svc, manager } = makeService(makeOffer(), { siblings });
    const at = new Date();

    const result = await svc.rejectPendingOffersForRequest('br1', at, manager);

    expect(result).toEqual(siblings);
    const [, where] = manager.find.mock.calls[0];
    expect(where.where.id).toBeUndefined(); // nobody spared
    expect(manager.update).toHaveBeenCalledWith(
      BuyRequestOffer,
      expect.objectContaining({ status: BuyRequestOfferStatus.PENDING }),
      { status: BuyRequestOfferStatus.REJECTED, respondedAt: at },
    );
  });
});
