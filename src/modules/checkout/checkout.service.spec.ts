import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { ListingStatus } from '../../database/entities/listing.entity';
import { OfferStatus } from '../../database/entities/offer.entity';
import {
  AccountType,
  VerificationTier,
} from '../../database/entities/user.entity';

/**
 * The all-or-nothing checkout pipeline (rev-2 spec 01.6): grouping by seller,
 * server-side price resolution (incl. the 24h offer lock), the tier cap on
 * the CHECKOUT TOTAL, race-checked listing flips, and the single wallet lock.
 */
const HOUR = 60 * 60 * 1000;

const buyer: any = {
  id: 'buyer',
  accountType: AccountType.STUDENT,
  verificationTier: VerificationTier.TIER_2,
  universityId: 'u1',
};

function listing(id: string, sellerId: string, price: number, over: any = {}) {
  return {
    id,
    sellerId,
    price,
    title: `Item ${id}`,
    status: ListingStatus.ACTIVE,
    meetupPoints: ['Main gate', 'Library Building', 'Student Union'],
    ...over,
  };
}

function makeService(opts: {
  listings?: Record<string, any>;
  offers?: Record<string, any>;
  vendorListings?: Record<string, any>;
  dropPoints?: Record<string, any>;
  vendorServes?: boolean;
  rawItems?: Array<{
    listingId?: string;
    offerId?: string | null;
    vendorListingId?: string;
    quantity?: number;
    selectedOptionIds?: string[];
  }>;
  flipAffected?: (listingId: string) => number;
  stockUpdateFails?: boolean;
} = {}) {
  const listingRepo: any = {
    findOne: jest.fn(async ({ where }: any) => opts.listings?.[where.id] ?? null),
  };
  const offerRepo: any = {
    findOne: jest.fn(async ({ where }: any) => opts.offers?.[where.id] ?? null),
  };
  const vendorListingRepo: any = {
    findOne: jest.fn(async ({ where }: any) => opts.vendorListings?.[where.id] ?? null),
  };
  const vendorUniversityRepo: any = {
    findOne: jest.fn(async () => (opts.vendorServes === false ? null : { id: 'vu1' })),
  };
  const dropPointRepo: any = {
    findOne: jest.fn(async ({ where }: any) => opts.dropPoints?.[where.id] ?? null),
  };
  const queryRunner: any = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    manager: {
      create: (_entity: any, o: any) => ({ ...o }),
      save: jest.fn(async (x: any) => x),
      update: jest.fn(async (_entity: any, criteria: any) => ({
        affected: opts.flipAffected ? opts.flipAffected(criteria.id) : 1,
      })),
      query: jest.fn(async () =>
        opts.stockUpdateFails ? [] : [{ id: 'row' }],
      ),
      findOne: jest.fn(async (_entity: any, { where }: any) =>
        opts.vendorListings?.[where.id] ?? null,
      ),
    },
  };
  const dataSource: any = {
    createQueryRunner: jest.fn(() => queryRunner),
  };
  const cartService: any = {
    getRawItems: jest.fn(async () =>
      (opts.rawItems ?? []).map((raw) => ({
        listingId: raw.listingId ?? null,
        offerId: raw.offerId ?? null,
        vendorListingId: raw.vendorListingId ?? null,
        quantity: raw.quantity ?? 1,
        selectedOptions: raw.selectedOptionIds
          ? { optionIds: raw.selectedOptionIds }
          : null,
      })),
    ),
    clear: jest.fn(async () => {}),
    lineOptionIds: (item: any) => item.selectedOptions?.optionIds ?? [],
    isOfferLockValid: (offer: any) =>
      offer?.status === OfferStatus.ACCEPTED &&
      !!offer.respondedAt &&
      Date.now() < new Date(offer.respondedAt).getTime() + 24 * HOUR,
    agreedOfferPrice: (offer: any) => Number(offer.counterAmount ?? offer.amount),
  };
  const escrowService: any = {
    createP2pSubOrder: jest.fn(async (_qr: any, params: any) => ({
      id: `esc-${params.sellerId}`,
      orderNumber: `ORD-${params.sellerId}`,
      sellerId: params.sellerId,
      amount: params.amount,
      market: 'p2p',
      status: 'awaiting_seller',
      deliveryMethod: 'meetup',
      deliveryLocation: params.deliveryLocation,
      checkoutId: params.checkoutId,
    })),
    createVendorSubOrder: jest.fn(async (_qr: any, params: any) => ({
      id: `esc-${params.sellerId}`,
      orderNumber: `ORD-${params.sellerId}`,
      sellerId: params.sellerId,
      amount: params.amount,
      market: 'vendor',
      status: params.confirmationRequired
        ? 'pending_confirmation'
        : 'awaiting_seller',
      deliveryMethod: params.deliveryMethod,
      deliveryLocation: params.deliveryLocation,
      checkoutId: params.checkoutId,
    })),
    finalizeSubOrderPlacement: jest.fn(async () => {}),
    finalizeVendorSubOrderPlacement: jest.fn(async () => {}),
  };
  const walletService: any = { lockFunds: jest.fn(async () => ({})) };

  const svc = new CheckoutService(
    dataSource,
    listingRepo,
    offerRepo,
    vendorListingRepo,
    vendorUniversityRepo,
    dropPointRepo,
    cartService,
    escrowService,
    walletService,
  );
  return {
    svc,
    dataSource,
    queryRunner,
    cartService,
    escrowService,
    walletService,
  };
}

function vendorListing(id: string, over: any = {}) {
  return {
    id,
    vendorProfileId: 'vp1',
    vendorProfile: {
      id: 'vp1',
      userId: 'vendor-user',
      businessName: 'Jollof Palace',
      homeUniversityId: 'u1',
      shopAddress: 'Shop 4, Mama T Plaza',
      status: 'active',
    },
    type: 'goods',
    title: `Vendor item ${id}`,
    basePrice: 3000,
    stock: 10,
    manualConfirm: false,
    status: 'active',
    optionGroups: [],
    fulfillment: [
      { universityId: 'u1', deliveryEnabled: true, deliveryFee: 500 },
    ],
    ...over,
  };
}

describe('CheckoutService.checkoutFromCart', () => {
  it('splits by seller, locks the total ONCE, commits, and clears the cart', async () => {
    const { svc, queryRunner, cartService, escrowService, walletService } =
      makeService({
        listings: {
          l1: listing('l1', 's1', 10000),
          l2: listing('l2', 's1', 5000),
          l3: listing('l3', 's2', 8000),
        },
        rawItems: [{ listingId: 'l1' }, { listingId: 'l2' }, { listingId: 'l3' }],
      });

    const result = await svc.checkoutFromCart(buyer, {
      pin: '135790',
      meetupSelections: [
        { listingId: 'l1', meetupPointIndex: 0 },
        { listingId: 'l3', meetupPointIndex: 1 },
      ],
    } as any);

    expect(result.total).toBe(23000);
    expect(result.orders).toHaveLength(2);
    expect(escrowService.createP2pSubOrder).toHaveBeenCalledTimes(2);
    const amounts = escrowService.createP2pSubOrder.mock.calls
      .map((c: any[]) => c[1].amount)
      .sort((a: number, b: number) => a - b);
    expect(amounts).toEqual([8000, 15000]);

    expect(walletService.lockFunds).toHaveBeenCalledTimes(1);
    const [lockUser, lockAmount, lockRef] = walletService.lockFunds.mock.calls[0];
    expect(lockUser).toBe('buyer');
    expect(lockAmount).toBe(23000);
    expect(lockRef).toMatch(/^CHECKOUT_/);

    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(cartService.clear).toHaveBeenCalledWith('buyer');
    expect(escrowService.finalizeSubOrderPlacement).toHaveBeenCalledTimes(2);
  });

  it('enforces the tier buy-limit on the CHECKOUT TOTAL, before any transaction', async () => {
    const tier0Buyer = {
      ...buyer,
      verificationTier: VerificationTier.TIER_0,
    };
    const { svc, dataSource, walletService } = makeService({
      listings: {
        l1: listing('l1', 's1', 20000),
        l3: listing('l3', 's2', 20000),
      },
      rawItems: [{ listingId: 'l1' }, { listingId: 'l3' }],
    });

    // Each line is under the ₦30k TIER_0 cap; the 40k TOTAL is not.
    await expect(
      svc.checkoutFromCart(tier0Buyer as any, {
        pin: '135790',
        meetupSelections: [
          { listingId: 'l1', meetupPointIndex: 0 },
          { listingId: 'l3', meetupPointIndex: 0 },
        ],
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
    expect(walletService.lockFunds).not.toHaveBeenCalled();
  });

  it('rolls back everything when a listing is snatched mid-checkout (race)', async () => {
    const { svc, queryRunner, walletService, cartService } = makeService({
      listings: {
        l1: listing('l1', 's1', 10000),
        l3: listing('l3', 's2', 8000),
      },
      rawItems: [{ listingId: 'l1' }, { listingId: 'l3' }],
      flipAffected: (id) => (id === 'l3' ? 0 : 1), // l3 loses the race
    });

    await expect(
      svc.checkoutFromCart(buyer, {
        pin: '135790',
        meetupSelections: [
          { listingId: 'l1', meetupPointIndex: 0 },
          { listingId: 'l3', meetupPointIndex: 0 },
        ],
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(walletService.lockFunds).not.toHaveBeenCalled();
    expect(cartService.clear).not.toHaveBeenCalled(); // cart survives a failed checkout
  });

  it('reports stale lines with per-line reasons', async () => {
    const { svc } = makeService({
      listings: {
        l1: listing('l1', 's1', 10000, { status: ListingStatus.SOLD }),
        l2: listing('l2', 'buyer', 5000), // own listing
      },
      rawItems: [{ listingId: 'l1' }, { listingId: 'l2' }, { listingId: 'gone' }],
    });

    try {
      await svc.checkoutFromCart(buyer, {
        pin: '135790',
        meetupSelections: [{ listingId: 'l1', meetupPointIndex: 0 }],
      } as any);
      fail('expected BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body: any = (error as BadRequestException).getResponse();
      const reasons = Object.fromEntries(
        body.issues.map((i: any) => [i.listingId, i.reason]),
      );
      expect(reasons).toEqual({
        l1: 'listing_unavailable',
        l2: 'own_listing',
        gone: 'listing_unavailable',
      });
    }
  });

  it('requires a meet-up selection for every seller and a valid index', async () => {
    const twoSellers = {
      listings: {
        l1: listing('l1', 's1', 10000),
        l3: listing('l3', 's2', 8000),
      },
      rawItems: [{ listingId: 'l1' }, { listingId: 'l3' }],
    };

    const missing = makeService(twoSellers);
    await expect(
      missing.svc.checkoutFromCart(buyer, {
        pin: '135790',
        meetupSelections: [{ listingId: 'l1', meetupPointIndex: 0 }], // s2 missing
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    const outOfRange = makeService(twoSellers);
    await expect(
      outOfRange.svc.checkoutFromCart(buyer, {
        pin: '135790',
        meetupSelections: [
          { listingId: 'l1', meetupPointIndex: 0 },
          { listingId: 'l3', meetupPointIndex: 9 },
        ],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CheckoutService vendor planning (rev-2 03.2/03.5)', () => {
  const optioned = () =>
    vendorListing('v1', {
      basePrice: 3000,
      optionGroups: [
        {
          id: 'g1',
          name: 'Size',
          selectionType: 'single',
          required: true,
          options: [
            { id: 'op1', name: 'Regular', priceDelta: 0, stock: null },
            { id: 'op2', name: 'Large', priceDelta: 500, stock: 5 },
          ],
        },
      ],
    });

  it('prices options + quantity, charges only the HIGHEST delivery fee, manual line ⇒ pending confirmation', async () => {
    const { svc, escrowService, walletService } = makeService({
      vendorListings: {
        v1: optioned(),
        v2: vendorListing('v2', {
          basePrice: 2000,
          manualConfirm: true,
          fulfillment: [
            { universityId: 'u1', deliveryEnabled: true, deliveryFee: 900 },
          ],
        }),
      },
      rawItems: [
        { vendorListingId: 'v1', quantity: 2, selectedOptionIds: ['op2'] },
        { vendorListingId: 'v2', quantity: 1 },
      ],
    });

    const result = await svc.checkoutFromCart(buyer, {
      pin: '135790',
      vendorFulfillment: [
        { vendorProfileId: 'vp1', method: 'delivery', deliveryAddress: 'Room 12, Hostel A' },
      ],
    } as any);

    // (3000+500)*2 + 2000 = 9000 items; fee = max(500, 900) = 900
    expect(result.total).toBe(9900);
    const params = escrowService.createVendorSubOrder.mock.calls[0][1];
    expect(params.itemsSubtotal).toBe(9000);
    expect(params.deliveryFee).toBe(900);
    expect(params.amount).toBe(9900);
    expect(params.confirmationRequired).toBe(true); // one manual line taints the sub-order
    expect(params.deliveryMethod).toBe('delivery');
    expect(params.deliveryAddress).toBe('Room 12, Hostel A');
    expect(walletService.lockFunds.mock.calls[0][1]).toBe(9900);
  });

  it('a required single group demands a selection', async () => {
    const { svc } = makeService({
      vendorListings: { v1: optioned() },
      rawItems: [{ vendorListingId: 'v1', quantity: 1 }], // no selection
    });
    try {
      await svc.checkoutFromCart(buyer, {
        pin: '135790',
        vendorFulfillment: [{ vendorProfileId: 'vp1', method: 'pickup' }],
      } as any);
      fail('expected BadRequestException');
    } catch (error) {
      const body: any = (error as BadRequestException).getResponse();
      expect(body.issues[0].reason).toBe('selection_invalid');
    }
  });

  it('neighboring-university delivery requires a drop point (never an address)', async () => {
    const neighbor = { ...buyer, universityId: 'u2' };
    const listing = vendorListing('v1', {
      fulfillment: [{ universityId: 'u2', deliveryEnabled: true, deliveryFee: 700 }],
    });

    const rejected = makeService({
      vendorListings: { v1: listing },
      rawItems: [{ vendorListingId: 'v1' }],
    });
    await expect(
      rejected.svc.checkoutFromCart(neighbor as any, {
        pin: '135790',
        vendorFulfillment: [
          { vendorProfileId: 'vp1', method: 'delivery', deliveryAddress: 'My hostel' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    const accepted = makeService({
      vendorListings: { v1: listing },
      dropPoints: { dp1: { id: 'dp1', name: 'Main Gate', universityId: 'u2', isActive: true } },
      rawItems: [{ vendorListingId: 'v1' }],
    });
    const result = await accepted.svc.checkoutFromCart(neighbor as any, {
      pin: '135790',
      vendorFulfillment: [
        { vendorProfileId: 'vp1', method: 'delivery', dropPointId: 'dp1' },
      ],
    } as any);
    const params = accepted.escrowService.createVendorSubOrder.mock.calls[0][1];
    expect(params.dropPointId).toBe('dp1');
    expect(params.deliveryLocation).toContain('Main Gate');
    expect(result.total).toBe(3700);
  });

  it('a pickup-only line forces the whole sub-order to pickup', async () => {
    const { svc } = makeService({
      vendorListings: {
        v1: vendorListing('v1'),
        v2: vendorListing('v2', { fulfillment: [] }), // pickup-only
      },
      rawItems: [{ vendorListingId: 'v1' }, { vendorListingId: 'v2' }],
    });
    await expect(
      svc.checkoutFromCart(buyer, {
        pin: '135790',
        vendorFulfillment: [
          { vendorProfileId: 'vp1', method: 'delivery', deliveryAddress: 'Room 12' },
        ],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rolls everything back when stock is snatched mid-checkout', async () => {
    const { svc, queryRunner, walletService } = makeService({
      vendorListings: { v1: vendorListing('v1') },
      rawItems: [{ vendorListingId: 'v1', quantity: 3 }],
      stockUpdateFails: true,
    });
    await expect(
      svc.checkoutFromCart(buyer, {
        pin: '135790',
        vendorFulfillment: [{ vendorProfileId: 'vp1', method: 'pickup' }],
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(walletService.lockFunds).not.toHaveBeenCalled();
  });

  it('mixed P2P + vendor checkout: one lock covers both markets', async () => {
    const { svc, escrowService, walletService } = makeService({
      listings: { l1: listing('l1', 's1', 10000) },
      vendorListings: { v1: vendorListing('v1') },
      rawItems: [{ listingId: 'l1' }, { vendorListingId: 'v1', quantity: 1 }],
    });

    const result = await svc.checkoutFromCart(buyer, {
      pin: '135790',
      meetupSelections: [{ listingId: 'l1', meetupPointIndex: 0 }],
      vendorFulfillment: [{ vendorProfileId: 'vp1', method: 'pickup' }],
    } as any);

    expect(result.orders).toHaveLength(2);
    expect(result.total).toBe(13000);
    expect(escrowService.createP2pSubOrder).toHaveBeenCalledTimes(1);
    expect(escrowService.createVendorSubOrder).toHaveBeenCalledTimes(1);
    expect(walletService.lockFunds).toHaveBeenCalledTimes(1);
    expect(walletService.lockFunds.mock.calls[0][1]).toBe(13000);
    const vendorParams = escrowService.createVendorSubOrder.mock.calls[0][1];
    expect(vendorParams.deliveryMethod).toBe('pickup');
    expect(vendorParams.deliveryLocation).toBe('Shop 4, Mama T Plaza');
  });
});

describe('CheckoutService.checkoutDirect (buy-now + offer pricing)', () => {
  it("honours an accepted offer's agreed price within its 24h lock", async () => {
    const { svc, escrowService, walletService } = makeService({
      listings: { l1: listing('l1', 's1', 8000) },
      offers: {
        o1: {
          id: 'o1',
          listingId: 'l1',
          buyerId: 'buyer',
          status: OfferStatus.ACCEPTED,
          amount: 7000,
          counterAmount: 6000, // buyer accepted the counter
          respondedAt: new Date(Date.now() - 1 * HOUR),
        },
      },
    });

    const result = await svc.checkoutDirect(buyer, {
      listingId: 'l1',
      offerId: 'o1',
      meetupPointIndex: 0,
      pin: '135790',
    } as any);

    expect(result.total).toBe(6000);
    expect(escrowService.createP2pSubOrder.mock.calls[0][1].amount).toBe(6000);
    expect(escrowService.createP2pSubOrder.mock.calls[0][1].lines[0].offerId).toBe('o1');
    expect(walletService.lockFunds.mock.calls[0][1]).toBe(6000);
  });

  it('rejects an offer whose 24h price lock has lapsed', async () => {
    const { svc } = makeService({
      listings: { l1: listing('l1', 's1', 8000) },
      offers: {
        o1: {
          id: 'o1',
          listingId: 'l1',
          buyerId: 'buyer',
          status: OfferStatus.ACCEPTED,
          amount: 6000,
          counterAmount: null,
          respondedAt: new Date(Date.now() - 25 * HOUR),
        },
      },
    });

    try {
      await svc.checkoutDirect(buyer, {
        listingId: 'l1',
        offerId: 'o1',
        meetupPointIndex: 0,
        pin: '135790',
      } as any);
      fail('expected BadRequestException');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body: any = (error as BadRequestException).getResponse();
      expect(body.issues[0].reason).toBe('offer_lock_expired');
    }
  });
});
