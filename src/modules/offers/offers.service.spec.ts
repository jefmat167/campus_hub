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
  const svc = new OffersService(offerRepository, listingRepository, userRepository);
  return { svc, offerRepository, listingRepository };
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
