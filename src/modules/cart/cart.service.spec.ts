import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CartService } from './cart.service';
import { ListingStatus } from '../../database/entities/listing.entity';
import { OfferStatus } from '../../database/entities/offer.entity';

/**
 * Cart rules (rev-2 spec 01.6): no holds, price locks via accepted offers
 * (24h), per-line freshness flags instead of silent drops.
 */
const HOUR = 60 * 60 * 1000;

function makeService(opts: {
  listings?: Record<string, any>;
  offers?: Record<string, any>;
  existingLine?: any;
  cartItems?: any[];
} = {}) {
  const cart = { id: 'cart1', userId: 'buyer' };
  const cartRepo: any = {
    findOne: jest.fn(async () => cart),
    create: (o: any) => ({ ...o }),
    save: jest.fn(async (c: any) => ({ id: 'cart1', ...c })),
  };
  const cartItemRepo: any = {
    findOne: jest.fn(async () => opts.existingLine ?? null),
    find: jest.fn(async () => opts.cartItems ?? []),
    create: (o: any) => ({ ...o }),
    save: jest.fn(async (line: any) => ({ id: line.id ?? 'line1', ...line })),
    delete: jest.fn(async () => ({})),
  };
  const listingRepo: any = {
    findOne: jest.fn(async ({ where }: any) => opts.listings?.[where.id] ?? null),
  };
  const offerRepo: any = {
    findOne: jest.fn(async ({ where }: any) => opts.offers?.[where.id] ?? null),
  };
  const timingPolicy: any = { resolve: () => ({ offerLockHours: 24 }) };

  const svc = new CartService(
    cartRepo,
    cartItemRepo,
    listingRepo,
    offerRepo,
    timingPolicy,
  );
  return { svc, cartItemRepo };
}

const activeListing = (over: any = {}) => ({
  id: 'l1',
  sellerId: 's1',
  title: 'Mini fridge',
  price: 10000,
  status: ListingStatus.ACTIVE,
  meetupPoints: ['Main gate', 'Library', 'SUB'],
  seller: { fullName: 'Amina Bello' },
  ...over,
});

describe('CartService.addItem', () => {
  it('adds a listing at its listed price', async () => {
    const { svc, cartItemRepo } = makeService({
      listings: { l1: activeListing() },
    });

    await svc.addItem('buyer', { listingId: 'l1' });

    expect(cartItemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'l1', priceAtAdd: 10000, offerId: null }),
    );
  });

  it('requires exactly one of listingId / offerId', async () => {
    const { svc } = makeService();
    await expect(svc.addItem('buyer', {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      svc.addItem('buyer', { listingId: 'l1', offerId: 'o1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects own listings and unavailable listings', async () => {
    const own = makeService({
      listings: { l1: activeListing({ sellerId: 'buyer' }) },
    });
    await expect(own.svc.addItem('buyer', { listingId: 'l1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const sold = makeService({
      listings: { l1: activeListing({ status: ListingStatus.SOLD }) },
    });
    await expect(sold.svc.addItem('buyer', { listingId: 'l1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const gone = makeService({});
    await expect(gone.svc.addItem('buyer', { listingId: 'nope' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("adds via an accepted offer at the agreed (counter) price, owner-only, within the 24h lock", async () => {
    const offer = {
      id: 'o1',
      buyerId: 'buyer',
      status: OfferStatus.ACCEPTED,
      amount: 9000,
      counterAmount: 8500,
      respondedAt: new Date(Date.now() - 2 * HOUR),
      listing: activeListing(),
    };
    const { svc, cartItemRepo } = makeService({ offers: { o1: offer } });

    await svc.addItem('buyer', { offerId: 'o1' });
    expect(cartItemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ offerId: 'o1', priceAtAdd: 8500 }),
    );

    const notMine = makeService({
      offers: { o1: { ...offer, buyerId: 'someone-else' } },
    });
    await expect(
      notMine.svc.addItem('buyer', { offerId: 'o1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const lapsed = makeService({
      offers: { o1: { ...offer, respondedAt: new Date(Date.now() - 25 * HOUR) } },
    });
    await expect(
      lapsed.svc.addItem('buyer', { offerId: 'o1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('re-adding the same listing refreshes the line instead of duplicating', async () => {
    const existingLine = {
      id: 'line1',
      cartId: 'cart1',
      listingId: 'l1',
      offerId: null,
      priceAtAdd: 9000,
    };
    const { svc, cartItemRepo } = makeService({
      listings: { l1: activeListing({ price: 10000 }) },
      existingLine,
    });

    await svc.addItem('buyer', { listingId: 'l1' });

    expect(cartItemRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'line1', priceAtAdd: 10000 }),
    );
  });
});

describe('CartService.getCart freshness flags', () => {
  it('flags stale lines and excludes them from totals/readiness', async () => {
    const staleOffer = {
      id: 'o1',
      buyerId: 'buyer',
      status: OfferStatus.ACCEPTED,
      amount: 7000,
      counterAmount: null,
      respondedAt: new Date(Date.now() - 30 * HOUR), // lock lapsed
    };
    const { svc } = makeService({
      listings: {
        l1: activeListing(), // clean
        l2: activeListing({ id: 'l2', status: ListingStatus.SOLD }), // gone
        l3: activeListing({ id: 'l3', price: 12000 }), // price moved
      },
      offers: { o1: staleOffer },
      cartItems: [
        { id: 'i1', listingId: 'l1', offerId: null, priceAtAdd: 10000, quantity: 1 },
        { id: 'i2', listingId: 'l2', offerId: null, priceAtAdd: 5000, quantity: 1 },
        { id: 'i3', listingId: 'l3', offerId: null, priceAtAdd: 9000, quantity: 1 },
        { id: 'i4', listingId: 'l1', offerId: 'o1', priceAtAdd: 7000, quantity: 1 },
      ],
    });

    const view = await svc.getCart('buyer');

    const byId = Object.fromEntries(view.lines.map((l) => [l.id, l]));
    expect(byId['i1'].issues).toEqual([]);
    expect(byId['i2'].issues).toContain('listing_unavailable');
    expect(byId['i3'].issues).toContain('price_changed');
    expect(byId['i4'].issues).toContain('offer_lock_expired');

    // only the clean line counts
    expect(view.itemsSubtotal).toBe(10000);
    expect(view.readyToCheckout).toBe(false);
  });
});
