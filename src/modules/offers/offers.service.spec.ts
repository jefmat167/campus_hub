import { OffersService } from './offers.service';
import { OfferStatus } from '../../database/entities/offer.entity';
import { OfferResponseAction } from './dto';

/**
 * Rev-2 behaviour change (spec 01.6): accepting an offer is a PRICE lock, not
 * an availability hold. The old implementation flipped the listing to
 * IN_ESCROW on acceptance, which dead-ended the purchase (POST /escrow
 * rejects non-ACTIVE listings). Acceptance must leave the listing untouched.
 */
function makeService(offer: any) {
  const offerRepository: any = {
    findOne: jest.fn(async () => offer),
    find: jest.fn(async () => []),
    update: jest.fn(async (criteria: any, patch: any) => {
      if (criteria === offer.id && patch.status) {
        Object.assign(offer, patch);
      }
      return {};
    }),
  };
  const listingRepository: any = {
    findOne: jest.fn(async () => null),
    update: jest.fn(async () => ({})),
  };
  const userRepository: any = {};
  const notificationsService: any = { createNotification: jest.fn(async () => ({})) };
  const svc = new OffersService(
    offerRepository,
    listingRepository,
    userRepository,
    notificationsService,
  );
  return { svc, offerRepository, listingRepository, notificationsService };
}

describe('OffersService accept (price lock, not availability hold)', () => {
  const makeOffer = () => ({
    id: 'o1',
    listingId: 'l1',
    buyerId: 'b1',
    sellerId: 's1',
    status: OfferStatus.PENDING,
    expiresAt: new Date(Date.now() + 60_000),
  });

  it('accepts the offer without touching the listing status', async () => {
    const offer: any = makeOffer();
    const { svc, offerRepository, listingRepository } = makeService(offer);

    await svc.respondToOffer('o1', 's1', {
      action: OfferResponseAction.ACCEPT,
    } as any);

    expect(offerRepository.update).toHaveBeenCalledWith(
      'o1',
      expect.objectContaining({ status: OfferStatus.ACCEPTED }),
    );
    // The listing is never reserved by acceptance — checkout does that.
    expect(listingRepository.update).not.toHaveBeenCalled();
  });

  it('still auto-rejects sibling offers on acceptance', async () => {
    const offer: any = makeOffer();
    const { svc, offerRepository } = makeService(offer);

    await svc.respondToOffer('o1', 's1', {
      action: OfferResponseAction.ACCEPT,
    } as any);

    expect(offerRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'l1' }),
      expect.objectContaining({ status: OfferStatus.REJECTED }),
    );
  });
});

describe('OffersService sanitization (no credential leak on User relations)', () => {
  // Without a global ClassSerializerInterceptor, @Exclude() never runs — the
  // service must strip these itself before an offer leaves the API.
  const rawParty = (id: string) => ({
    id,
    fullName: `User ${id}`,
    email: `${id}@test.ng`,
    phone: '2348000000000',
    profilePhotoUrl: null,
    verificationTier: 'tier_1',
    sellerRating: null,
    sellerRatingCount: 0,
    passwordHash: '$2b$12$secret',
    pinHash: '$2b$12$pin',
    pinAttempts: 0,
    pinLockedUntil: null,
    refreshTokenHash: '$2b$12$refresh',
  });

  it('strips credential fields from buyer and seller on getOfferById', async () => {
    const offer: any = {
      id: 'o1',
      listingId: 'l1',
      buyerId: 'b1',
      sellerId: 's1',
      status: OfferStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      buyer: rawParty('b1'),
      seller: rawParty('s1'),
    };
    const { svc } = makeService(offer);

    const result: any = await svc.getOfferById('o1', 'b1');

    for (const party of [result.buyer, result.seller]) {
      expect(party.fullName).toBeDefined();
      expect(party.passwordHash).toBeUndefined();
      expect(party.pinHash).toBeUndefined();
      expect(party.pinAttempts).toBeUndefined();
      expect(party.pinLockedUntil).toBeUndefined();
      expect(party.refreshTokenHash).toBeUndefined();
    }
  });

  it('strips credential fields across list endpoints', async () => {
    const offer: any = {
      id: 'o1',
      listingId: 'l1',
      buyerId: 'b1',
      sellerId: 's1',
      status: OfferStatus.PENDING,
      expiresAt: new Date(Date.now() + 60_000),
      seller: rawParty('s1'),
    };
    const { svc, offerRepository } = makeService(offer);
    offerRepository.findAndCount = jest.fn(async () => [[offer], 1]);

    const page: any = await svc.getBuyerOffers('b1');

    expect(page.offers[0].seller.passwordHash).toBeUndefined();
    expect(page.offers[0].seller.refreshTokenHash).toBeUndefined();
    expect(page.offers[0].seller.fullName).toBe('User s1');
  });
});

describe('OffersService.markExpiredOffers (sweep)', () => {
  // Nothing scheduled this before OffersProcessor existed — stale offers sat
  // `pending` forever. The sweep flips them and tells the buyer.
  it('returns 0 and issues no update when nothing is overdue', async () => {
    const { svc, offerRepository, notificationsService } = makeService({ id: 'o1' });

    expect(await svc.markExpiredOffers()).toBe(0);
    expect(offerRepository.update).not.toHaveBeenCalled();
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });

  it('flips overdue PENDING/COUNTERED offers and notifies each buyer', async () => {
    const { svc, offerRepository, notificationsService } = makeService({ id: 'o1' });
    offerRepository.find = jest.fn(async () => [
      { id: 'o1', buyerId: 'b1', listingId: 'l1', status: OfferStatus.PENDING, listing: { title: 'Bike' } },
      { id: 'o2', buyerId: 'b2', listingId: 'l2', status: OfferStatus.COUNTERED, listing: { title: 'Lamp' } },
    ]);
    offerRepository.update = jest.fn(async () => ({ affected: 2 }));
    notificationsService.createNotification.mockRejectedValueOnce(new Error('push down'));

    const count = await svc.markExpiredOffers();

    expect(count).toBe(2);
    const [criteria, patch] = offerRepository.update.mock.calls[0];
    expect(criteria.id.value).toEqual(['o1', 'o2']);
    expect(patch).toEqual({ status: OfferStatus.EXPIRED });
    const notices = notificationsService.createNotification.mock.calls.map(([p]: any[]) => p);
    expect(notices.map((p: any) => p.userId)).toEqual(['b1', 'b2']);
    expect(notices[1].body).toMatch(/counter/i);
  });
});
