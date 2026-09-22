import { BadRequestException } from '@nestjs/common';
import { VendorDeliveryService } from './vendor-delivery.service';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';

/**
 * Vendor-level delivery presets (2026-09-21 amendment to spec 03.2): the
 * settings writer's invariants (⊆ served, door fee home-only, active points at
 * that campus, ≤ 3, no dupes, omitted campus → pickup-only), and the resolver
 * shape buyers/checkout consume (isHome, active points only, sorted).
 */
const profile: any = {
  id: 'vp1',
  businessName: 'Jollof Palace',
  homeUniversityId: 'u1',
  status: VendorStatus.ACTIVE,
};

/** Unwrap a TypeORM `In([...])` FindOperator (or a plain value) in a where clause. */
const values = (criterion: any): any[] =>
  criterion && typeof criterion === 'object' && 'value' in criterion
    ? criterion.value
    : [criterion];

function makeService(opts: { rows?: any[]; dropPoints?: any[]; status?: VendorStatus } = {}) {
  const vendorProfile = { ...profile, status: opts.status ?? VendorStatus.ACTIVE };
  const rows = opts.rows ?? [
    {
      id: 'vu1',
      vendorProfileId: 'vp1',
      universityId: 'u1',
      doorDeliveryFee: null,
      serviceTravelFee: null,
      deliveryPoints: [],
      university: { name: 'Uni One', code: 'U1' },
      createdAt: new Date(1),
    },
    {
      id: 'vu2',
      vendorProfileId: 'vp1',
      universityId: 'u2',
      doorDeliveryFee: null,
      serviceTravelFee: null,
      deliveryPoints: [],
      university: { name: 'Uni Two', code: 'U2' },
      createdAt: new Date(2),
    },
  ];
  const dropPoints = opts.dropPoints ?? [
    { id: 'dp1', universityId: 'u1', name: 'Main Gate', directions: null, isActive: true },
    { id: 'dp2', universityId: 'u1', name: 'Hostel A', directions: 'Porter', isActive: true },
    { id: 'dp4', universityId: 'u1', name: 'Library', directions: null, isActive: true },
    { id: 'dp5', universityId: 'u1', name: 'Sports Centre', directions: null, isActive: true },
    { id: 'dpX', universityId: 'u1', name: 'Old Gate', directions: null, isActive: false },
    { id: 'dp3', universityId: 'u2', name: 'North Gate', directions: null, isActive: true },
  ];

  const vendorUniversityRepo: any = {
    find: jest.fn(async () => rows),
    findOne: jest.fn(async ({ where }: any) => {
      const row = rows.find(
        (r) => r.vendorProfileId === where.vendorProfileId && r.universityId === where.universityId,
      );
      return row ? { ...row, vendorProfile } : null;
    }),
  };
  const deliveryPointRepo: any = {};
  const dropPointRepo: any = {
    find: jest.fn(async ({ where }: any) => {
      let result = dropPoints;
      if (where.id !== undefined) {
        const ids = values(where.id);
        result = result.filter((p) => ids.includes(p.id));
      }
      if (where.universityId !== undefined) {
        const ids = values(where.universityId);
        result = result.filter((p) => ids.includes(p.universityId));
      }
      if (where.isActive !== undefined) {
        result = result.filter((p) => p.isActive === where.isActive);
      }
      return result;
    }),
  };
  const savedEntities: any[] = [];
  const manager: any = {
    create: (_entity: any, o: any) => ({ ...o }),
    save: jest.fn(async (o: any) => {
      savedEntities.push(o);
      return o;
    }),
    delete: jest.fn(async () => ({})),
  };
  const dataSource: any = {
    transaction: jest.fn(async (fn: any) => fn(manager)),
  };

  const svc = new VendorDeliveryService(
    vendorUniversityRepo,
    deliveryPointRepo,
    dropPointRepo,
    dataSource,
  );
  return { svc, rows, manager, savedEntities, vendorProfile };
}

describe('VendorDeliveryService.replace', () => {
  it('writes fees on the served rows and the chosen points with THEIR fees; an omitted campus resets to pickup-only', async () => {
    const { svc, rows, manager, savedEntities } = makeService();
    rows[1].doorDeliveryFee = null;
    rows[1].serviceTravelFee = 900; // was set before; u2 is omitted below → reset

    await svc.replace(profile, {
      universities: [
        {
          universityId: 'u1',
          doorDeliveryFee: 500,
          serviceTravelFee: 1000,
          dropPoints: [
            { dropPointId: 'dp1', fee: 300 },
            { dropPointId: 'dp2', fee: 400 },
          ],
        },
      ],
    } as any);

    expect(rows[0].doorDeliveryFee).toBe(500);
    expect(rows[0].serviceTravelFee).toBe(1000);
    expect(rows[1].doorDeliveryFee).toBeNull();
    expect(rows[1].serviceTravelFee).toBeNull();
    // Points are replaced wholesale per campus.
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { vendorUniversityId: 'vu1' });
    expect(manager.delete).toHaveBeenCalledWith(expect.anything(), { vendorUniversityId: 'vu2' });
    const points = savedEntities.filter((e) => e.dropPointId);
    expect(points).toEqual([
      { vendorUniversityId: 'vu1', dropPointId: 'dp1', fee: 300 },
      { vendorUniversityId: 'vu1', dropPointId: 'dp2', fee: 400 },
    ]);
  });

  it('a door fee of 0 is "free", not "off"', async () => {
    const { svc, rows } = makeService();
    await svc.replace(profile, {
      universities: [{ universityId: 'u1', doorDeliveryFee: 0, dropPoints: [] }],
    } as any);
    expect(rows[0].doorDeliveryFee).toBe(0);
  });

  it.each([
    ['a campus the vendor does not serve', { universityId: 'u9', dropPoints: [] }, /universities this vendor serves/],
    ['a door fee off the home campus', { universityId: 'u2', doorDeliveryFee: 300, dropPoints: [] }, /only available on your home campus/],
    ['an inactive drop point', { universityId: 'u1', dropPoints: [{ dropPointId: 'dpX', fee: 1 }] }, /not an active drop point/],
    ['an unknown drop point', { universityId: 'u1', dropPoints: [{ dropPointId: 'nope', fee: 1 }] }, /not an active drop point/],
    ['a drop point at another campus', { universityId: 'u1', dropPoints: [{ dropPointId: 'dp3', fee: 1 }] }, /not at that university/],
    ['a duplicate drop point', { universityId: 'u1', dropPoints: [{ dropPointId: 'dp1', fee: 1 }, { dropPointId: 'dp1', fee: 2 }] }, /Duplicate drop point/],
    [
      'more than 3 drop points',
      { universityId: 'u1', dropPoints: ['dp1', 'dp2', 'dp4', 'dp5'].map((id) => ({ dropPointId: id, fee: 1 })) },
      /At most 3 drop points/,
    ],
  ])('rejects %s', async (_label, campus, message) => {
    const { svc } = makeService();
    await expect(
      svc.replace(profile, { universities: [campus] } as any),
    ).rejects.toThrow(message);
  });

  it('rejects a campus listed twice', async () => {
    const { svc } = makeService();
    await expect(
      svc.replace(profile, {
        universities: [
          { universityId: 'u1', dropPoints: [] },
          { universityId: 'u1', dropPoints: [] },
        ],
      } as any),
    ).rejects.toThrow(/Duplicate university/);
  });

  it('suspended profiles are frozen', async () => {
    const { svc } = makeService();
    await expect(
      svc.replace({ ...profile, status: VendorStatus.SUSPENDED }, { universities: [] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('VendorDeliveryService.resolveForCampus', () => {
  it('null when the vendor does not serve the campus, or is not ACTIVE', async () => {
    const notServed = makeService();
    expect(await notServed.svc.resolveForCampus('vp1', 'u9')).toBeNull();

    const pending = makeService({ status: VendorStatus.PENDING_REVIEW });
    expect(await pending.svc.resolveForCampus('vp1', 'u1')).toBeNull();
    // …unless the caller opts out of the ACTIVE check.
    expect(
      await pending.svc.resolveForCampus('vp1', 'u1', { requireActive: false }),
    ).not.toBeNull();
  });

  it('shapes the preset: isHome, door fee only at home, active points only, sorted by name', async () => {
    const points = [
      { dropPointId: 'dp2', fee: 400, dropPoint: { id: 'dp2', name: 'Hostel A', directions: 'Porter', isActive: true } },
      { dropPointId: 'dpX', fee: 999, dropPoint: { id: 'dpX', name: 'Old Gate', directions: null, isActive: false } },
      { dropPointId: 'dp1', fee: 300, dropPoint: { id: 'dp1', name: 'Main Gate', directions: null, isActive: true } },
    ];
    const { svc } = makeService({
      rows: [
        {
          id: 'vu1',
          vendorProfileId: 'vp1',
          universityId: 'u1',
          doorDeliveryFee: 500,
          serviceTravelFee: 1500,
          deliveryPoints: points,
        },
        {
          id: 'vu2',
          vendorProfileId: 'vp1',
          universityId: 'u2',
          // A stray door fee on a non-home row is never surfaced.
          doorDeliveryFee: 250,
          serviceTravelFee: null,
          deliveryPoints: [],
        },
      ],
    });

    expect(await svc.resolveForCampus('vp1', 'u1')).toEqual({
      vendorProfileId: 'vp1',
      businessName: 'Jollof Palace',
      universityId: 'u1',
      isHome: true,
      doorDeliveryFee: 500,
      serviceTravelFee: 1500,
      dropPoints: [
        { id: 'dp2', name: 'Hostel A', directions: 'Porter', fee: 400 },
        { id: 'dp1', name: 'Main Gate', directions: null, fee: 300 },
      ],
    });

    expect(await svc.resolveForCampus('vp1', 'u2')).toMatchObject({
      isHome: false,
      doorDeliveryFee: null,
      serviceTravelFee: null,
      dropPoints: [],
    });
  });
});

describe('VendorDeliveryService.getOwn', () => {
  it('lists every served campus with its preset, the ACTIVE admin points available there, and flags retired picks', async () => {
    const { svc, rows } = makeService();
    rows[0].doorDeliveryFee = 500;
    rows[0].deliveryPoints = [
      { dropPointId: 'dp1', fee: 300, dropPoint: { id: 'dp1', name: 'Main Gate', directions: null, isActive: true } },
      { dropPointId: 'dpX', fee: 100, dropPoint: { id: 'dpX', name: 'Old Gate', directions: null, isActive: false } },
    ];

    const view: any = await svc.getOwn(profile);
    expect(view.universities).toHaveLength(2);

    const home = view.universities[0];
    expect(home).toMatchObject({
      universityId: 'u1',
      name: 'Uni One',
      isHome: true,
      doorDeliveryFee: 500,
      serviceTravelFee: null,
    });
    expect(home.dropPoints).toEqual([
      { dropPointId: 'dp1', name: 'Main Gate', directions: null, fee: 300, isActive: true },
      { dropPointId: 'dpX', name: 'Old Gate', directions: null, fee: 100, isActive: false },
    ]);
    // Inactive admin points are never offered for picking.
    expect(home.availableDropPoints.map((p: any) => p.id)).toEqual(['dp1', 'dp2', 'dp4', 'dp5']);

    const neighbour = view.universities[1];
    expect(neighbour).toMatchObject({ universityId: 'u2', isHome: false, doorDeliveryFee: null });
    expect(neighbour.availableDropPoints.map((p: any) => p.id)).toEqual(['dp3']);
  });
});
