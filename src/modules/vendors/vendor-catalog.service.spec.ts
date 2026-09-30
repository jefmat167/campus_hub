import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { VendorCatalogService } from './vendor-catalog.service';
import {
  ListingKind,
  ListingStatus,
} from '../../database/entities/listing.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';
import { OptionSelectionType } from '../../database/entities/vendor-option.entity';

/**
 * Catalog write-plane rules (rev-2 03.3 / 03.5 + decision log #8):
 * confirmation/stock matrix, service-stock rejection, the per-listing
 * `pickupOnly` opt-out of the vendor's delivery preset (2026-09-21 amendment
 * — delivery itself is no longer configured here), and the ACTIVE-storefront
 * gate on writes.
 */
const activeProfile: any = {
  id: 'vp1',
  userId: 'vendor-user',
  homeUniversityId: 'u1',
  status: VendorStatus.ACTIVE,
};

function makeService(opts: {
  listing?: any;
} = {}) {
  const savedEntities: any[] = [];
  const listingRepo: any = {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => opts.listing ?? null),
    save: jest.fn(async (l: any) => l),
    increment: jest.fn(async () => ({})),
  };
  const imageRepo: any = {
    count: jest.fn(async () => 0),
    create: (o: any) => ({ ...o }),
    save: jest.fn(async (o: any) => o),
  };
  const groupRepo: any = {
    createQueryBuilder: jest.fn(),
  };
  const manager: any = {
    create: (_entity: any, o: any) => ({ ...o }),
    save: jest.fn(async (o: any) => {
      savedEntities.push(o);
      return { id: o.id ?? `gen-${savedEntities.length}`, ...o };
    }),
    delete: jest.fn(async () => ({})),
  };
  const dataSource: any = {
    transaction: jest.fn(async (fn: any) => fn(manager)),
    getRepository: jest.fn(() => ({ save: jest.fn(async (o: any) => o) })),
  };
  const uploadService: any = {
    verifyUploadedFileSizes: jest.fn(async () => {}),
  };

  const svc = new VendorCatalogService(
    listingRepo,
    imageRepo,
    groupRepo,
    dataSource,
    uploadService,
  );
  // getOwnListing is called after writes — return something viewable.
  listingRepo.findOne.mockImplementation(async () =>
    opts.listing ?? {
      id: 'vl1',
      vendorProfileId: 'vp1',
      kind: ListingKind.VENDOR_GOODS,
      title: 'x',
      description: 'x',
      category: 'food',
      price: 1000,
      stock: 5,
      manualConfirm: false,
      pickupOnly: false,
      status: ListingStatus.ACTIVE,
      viewCount: 0,
      images: [],
      optionGroups: [],
      createdAt: new Date(),
    },
  );
  return { svc, savedEntities, listingRepo, manager, dataSource };
}

const baseDto = {
  kind: ListingKind.VENDOR_GOODS,
  title: 'Jollof rice (party pack)',
  description: 'Freshly made every morning, feeds four.',
  category: 'food' as any,
  price: 3500,
};

describe('VendorCatalogService.createListing — confirmation/stock matrix', () => {
  it('goods with tracked stock may auto-confirm', async () => {
    const { svc, savedEntities } = makeService();
    await svc.createListing(activeProfile, {
      ...baseDto,
      stock: 20,
      manualConfirm: false,
    } as any);
    const listing = savedEntities.find((e) => e.title);
    expect(listing.manualConfirm).toBe(false);
  });

  it('untracked stock FORCES manual confirmation (explicit false → 400)', async () => {
    const forced = makeService();
    await svc_create(forced.svc, { ...baseDto });
    const listing = forced.savedEntities.find((e) => e.title);
    expect(listing.manualConfirm).toBe(true);

    const rejected = makeService();
    await expect(
      rejected.svc.createListing(activeProfile, {
        ...baseDto,
        manualConfirm: false,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('services are always manual-confirm and never carry stock', async () => {
    const service = makeService();
    await service.svc.createListing(activeProfile, {
      ...baseDto,
      kind: ListingKind.VENDOR_SERVICE,
    } as any);
    const listing = service.savedEntities.find((e) => e.title);
    expect(listing.manualConfirm).toBe(true);
    expect(listing.stock).toBeNull();

    const withStock = makeService();
    await expect(
      withStock.svc.createListing(activeProfile, {
        ...baseDto,
        kind: ListingKind.VENDOR_SERVICE,
        stock: 5,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    const autoService = makeService();
    await expect(
      autoService.svc.createListing(activeProfile, {
        ...baseDto,
        kind: ListingKind.VENDOR_SERVICE,
        manualConfirm: false,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  async function svc_create(svc: VendorCatalogService, dto: any) {
    return svc.createListing(activeProfile, dto);
  }
});

describe('VendorCatalogService pickupOnly + option groups', () => {
  it('pickupOnly defaults to false (inherits the vendor preset) and persists when set', async () => {
    const inherits = makeService();
    await inherits.svc.createListing(activeProfile, {
      ...baseDto,
      stock: 5,
    } as any);
    expect(inherits.savedEntities.find((e) => e.title).pickupOnly).toBe(false);

    const optedOut = makeService();
    await optedOut.svc.createListing(activeProfile, {
      ...baseDto,
      stock: 5,
      pickupOnly: true,
    } as any);
    expect(optedOut.savedEntities.find((e) => e.title).pickupOnly).toBe(true);
  });

  it('pickupOnly rides the base-fields PATCH in both directions', async () => {
    const listing: any = {
      id: 'vl1',
      vendorProfileId: 'vp1',
      kind: ListingKind.VENDOR_GOODS,
      stock: 5,
      manualConfirm: false,
      pickupOnly: false,
      status: ListingStatus.ACTIVE,
      images: [],
      optionGroups: [],
    };
    const { svc, listingRepo } = makeService({ listing });

    await svc.updateListing(activeProfile, 'vl1', { pickupOnly: true } as any);
    expect(listingRepo.save.mock.calls[0][0].pickupOnly).toBe(true);

    await svc.updateListing(activeProfile, 'vl1', { pickupOnly: false } as any);
    expect(listingRepo.save.mock.calls[1][0].pickupOnly).toBe(false);
  });

  it('own views expose pickupOnly on the list AND the detail (the catalog list renders a chip)', async () => {
    const listing: any = {
      id: 'vl1',
      vendorProfileId: 'vp1',
      kind: ListingKind.VENDOR_GOODS,
      title: 'x',
      description: 'x',
      category: 'food',
      price: 1000,
      stock: 5,
      manualConfirm: false,
      pickupOnly: true,
      status: ListingStatus.ACTIVE,
      viewCount: 0,
      images: [],
      optionGroups: [],
      createdAt: new Date(),
    };
    const { svc, listingRepo } = makeService({ listing });
    listingRepo.find.mockResolvedValue([listing]);

    const [row] = await svc.listOwn(activeProfile);
    expect(row.pickupOnly).toBe(true);
    expect(row).not.toHaveProperty('fulfillment');

    const detail = await svc.getOwnListing(activeProfile, 'vl1');
    expect(detail.pickupOnly).toBe(true);
    expect(detail).not.toHaveProperty('fulfillment');
  });

  it('persists nested option groups with positions and defaults', async () => {
    const { svc, savedEntities } = makeService();
    await svc.createListing(activeProfile, {
      ...baseDto,
      stock: 5,
      optionGroups: [
        {
          name: 'Size',
          selectionType: OptionSelectionType.SINGLE,
          required: true,
          options: [{ name: 'Small' }, { name: 'Large', priceDelta: 500, stock: 3 }],
        },
      ],
    } as any);

    const group = savedEntities.find((e) => e.selectionType);
    expect(group).toMatchObject({ name: 'Size', required: true, position: 0 });
    const options = savedEntities.filter((e) => e.optionGroupId);
    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({ name: 'Small', priceDelta: 0, stock: null });
    expect(options[1]).toMatchObject({ name: 'Large', priceDelta: 500, stock: 3 });
  });
});

describe('VendorCatalogService write gate + stock adjust', () => {
  it('writes require an ACTIVE storefront', async () => {
    const { svc } = makeService();
    await expect(
      svc.createListing(
        { id: 'vp1', status: VendorStatus.SUSPENDED } as any,
        { ...baseDto, stock: 1 } as any,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('untracking stock via adjust forces manual confirmation back on', async () => {
    const listing: any = {
      id: 'vl1',
      vendorProfileId: 'vp1',
      kind: ListingKind.VENDOR_GOODS,
      stock: 5,
      manualConfirm: false,
      pickupOnly: false,
      status: ListingStatus.ACTIVE,
      images: [],
      optionGroups: [],
    };
    const { svc, listingRepo } = makeService({ listing });

    await svc.adjustBaseStock(activeProfile, 'vl1', { stock: null });

    const saved = listingRepo.save.mock.calls[0][0];
    expect(saved.stock).toBeNull();
    expect(saved.manualConfirm).toBe(true);
  });
});

describe('VendorCatalogService — services carry no per-option stock either', () => {
  const serviceListing: any = {
    id: 'vl1',
    vendorProfileId: 'vp1',
    kind: ListingKind.VENDOR_SERVICE,
    stock: null,
    manualConfirm: true,
    pickupOnly: false,
    status: ListingStatus.ACTIVE,
    images: [],
    optionGroups: [],
  };
  const groupsWithStock = [
    {
      name: 'Length',
      selectionType: OptionSelectionType.SINGLE,
      required: true,
      options: [{ name: 'Short', priceDelta: 0, stock: 3 }],
    },
  ];

  it('create: option stock on a service is a 400, and nothing is written', async () => {
    const { svc, dataSource } = makeService();
    await expect(
      svc.createListing(activeProfile, {
        ...baseDto,
        kind: ListingKind.VENDOR_SERVICE,
        optionGroups: groupsWithStock,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('create: service options WITHOUT stock are still fine', async () => {
    const { svc } = makeService();
    await expect(
      svc.createListing(activeProfile, {
        ...baseDto,
        kind: ListingKind.VENDOR_SERVICE,
        optionGroups: [
          { ...groupsWithStock[0], options: [{ name: 'Short', priceDelta: 0 }] },
        ],
      } as any),
    ).resolves.toBeDefined();
  });

  it('PUT option-groups: option stock on a service is a 400 before the old groups are deleted', async () => {
    const { svc, manager } = makeService({ listing: serviceListing });
    await expect(
      svc.replaceOptionGroups(activeProfile, 'vl1', { groups: groupsWithStock } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.delete).not.toHaveBeenCalled();
  });

  it('PATCH option stock on a service is a 400', async () => {
    const { svc } = makeService({ listing: serviceListing });
    await expect(
      svc.adjustOptionStock(activeProfile, 'vl1', 'opt1', { stock: 2 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
