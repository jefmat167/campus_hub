import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { VendorCatalogService } from './vendor-catalog.service';
import {
  VendorListingStatus,
  VendorListingType,
} from '../../database/entities/vendor-listing.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';
import { OptionSelectionType } from '../../database/entities/vendor-option.entity';

/**
 * Catalog write-plane rules (rev-2 03.3 / 03.5 + decision log #8):
 * confirmation/stock matrix, service-stock rejection, fulfillment ⊆ served
 * universities, and the ACTIVE-storefront gate on writes.
 */
const activeProfile: any = { id: 'vp1', status: VendorStatus.ACTIVE };

function makeService(opts: {
  served?: string[];
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
  const vendorUniversityRepo: any = {
    find: jest.fn(async () =>
      (opts.served ?? ['u1']).map((universityId) => ({ universityId })),
    ),
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
    vendorUniversityRepo,
    dataSource,
    uploadService,
  );
  // getOwnListing is called after writes — return something viewable.
  listingRepo.findOne.mockImplementation(async () =>
    opts.listing ?? {
      id: 'vl1',
      vendorProfileId: 'vp1',
      type: VendorListingType.GOODS,
      title: 'x',
      description: 'x',
      category: 'food',
      basePrice: 1000,
      stock: 5,
      manualConfirm: false,
      status: VendorListingStatus.ACTIVE,
      viewCount: 0,
      images: [],
      optionGroups: [],
      fulfillment: [],
      createdAt: new Date(),
    },
  );
  return { svc, savedEntities, listingRepo, manager, dataSource };
}

const baseDto = {
  type: VendorListingType.GOODS,
  title: 'Jollof rice (party pack)',
  description: 'Freshly made every morning, feeds four.',
  category: 'food' as any,
  basePrice: 3500,
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
      type: VendorListingType.SERVICE,
    } as any);
    const listing = service.savedEntities.find((e) => e.title);
    expect(listing.manualConfirm).toBe(true);
    expect(listing.stock).toBeNull();

    const withStock = makeService();
    await expect(
      withStock.svc.createListing(activeProfile, {
        ...baseDto,
        type: VendorListingType.SERVICE,
        stock: 5,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    const autoService = makeService();
    await expect(
      autoService.svc.createListing(activeProfile, {
        ...baseDto,
        type: VendorListingType.SERVICE,
        manualConfirm: false,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  async function svc_create(svc: VendorCatalogService, dto: any) {
    return svc.createListing(activeProfile, dto);
  }
});

describe('VendorCatalogService fulfillment + option groups', () => {
  it('rejects fulfillment rows for universities the vendor does not serve', async () => {
    const { svc } = makeService({ served: ['u1'] });
    await expect(
      svc.createListing(activeProfile, {
        ...baseDto,
        stock: 5,
        fulfillment: [{ universityId: 'u2', deliveryEnabled: true, deliveryFee: 500 }],
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it('delivery-disabled rows store a null fee; enabled rows default to 0', async () => {
    const { svc, savedEntities } = makeService({ served: ['u1', 'u2'] });
    await svc.createListing(activeProfile, {
      ...baseDto,
      stock: 5,
      fulfillment: [
        { universityId: 'u1', deliveryEnabled: true },
        { universityId: 'u2', deliveryEnabled: false, deliveryFee: 900 },
      ],
    } as any);

    const rows = savedEntities.filter((e) => e.universityId);
    expect(rows.find((r) => r.universityId === 'u1')).toMatchObject({
      deliveryEnabled: true,
      deliveryFee: 0,
    });
    expect(rows.find((r) => r.universityId === 'u2')).toMatchObject({
      deliveryEnabled: false,
      deliveryFee: null,
    });
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
      type: VendorListingType.GOODS,
      stock: 5,
      manualConfirm: false,
      status: VendorListingStatus.ACTIVE,
      images: [],
      optionGroups: [],
      fulfillment: [],
    };
    const { svc, listingRepo } = makeService({ listing });

    await svc.adjustBaseStock(activeProfile, 'vl1', { stock: null });

    const saved = listingRepo.save.mock.calls[0][0];
    expect(saved.stock).toBeNull();
    expect(saved.manualConfirm).toBe(true);
  });
});
