import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VendorsService } from './vendors.service';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';

/**
 * Vendor onboarding invariants + admin review-state machine, in the repo's
 * direct-instantiation spec style. University validity comes from a stubbed
 * UniversitiesService (throws for unknown/inactive ids).
 */
const ACTIVE_UNIS = new Set(['u1', 'u2', 'u3']);

function makeService(opts: { profile?: Partial<VendorProfile> | null } = {}) {
  const profile = opts.profile === undefined ? null : opts.profile;

  const profileRepo: any = {
    findOne: jest.fn(async () => profile),
    findAndCount: jest.fn(async () => [[], 0]),
    save: jest.fn(async (p: any) => p),
    create: (o: any) => ({ ...o }),
  };
  const vendorUniversityRepo: any = {
    delete: jest.fn(async () => ({})),
  };
  const managerStub: any = {
    create: (_entity: any, o: any) => ({ ...o }),
    save: jest.fn(async (o: any) => ({ id: o.id ?? 'vp1', ...o })),
    delete: jest.fn(async () => ({})),
  };
  const dataSource: any = {
    transaction: jest.fn(async (fn: any) => fn(managerStub)),
  };
  const universitiesService: any = {
    findUniversityById: jest.fn(async (id: string) => {
      if (!ACTIVE_UNIS.has(id)) throw new NotFoundException();
      return { id };
    }),
  };
  const notificationsService: any = {
    createNotification: jest.fn(async () => ({})),
  };

  const svc = new VendorsService(
    profileRepo,
    vendorUniversityRepo,
    dataSource,
    universitiesService,
    notificationsService,
  );
  return { svc, profileRepo, managerStub, notificationsService, dataSource };
}

describe('VendorsService.validateUniversitySelection', () => {
  it('accepts a valid selection (home ∈ served, all active, ≤3)', async () => {
    const { svc } = makeService();
    await expect(
      svc.validateUniversitySelection('u1', ['u1', 'u2']),
    ).resolves.toBeUndefined();
  });

  it('rejects duplicates', async () => {
    const { svc } = makeService();
    await expect(
      svc.validateUniversitySelection('u1', ['u1', 'u1']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects home not in served', async () => {
    const { svc } = makeService();
    await expect(
      svc.validateUniversitySelection('u3', ['u1', 'u2']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown/inactive universities', async () => {
    const { svc } = makeService();
    await expect(
      svc.validateUniversitySelection('u1', ['u1', 'nope']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('VendorsService.applyAsStudent (Door 1)', () => {
  const dto = {
    businessName: 'Print Hub',
    homeUniversityId: 'u1',
    servedUniversityIds: ['u1', 'u2'],
    shopfrontPhotoUrl: 'https://cdn.example.com/shop.jpg',
    photoCapturedLive: true,
  } as any;

  it('409s when the account already has a vendor profile', async () => {
    const { svc } = makeService({ profile: { id: 'vp1' } });
    await expect(svc.applyAsStudent('user1', dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates a PENDING_REVIEW profile with the photo and served rows', async () => {
    const { svc, managerStub, profileRepo } = makeService({ profile: null });
    // getMyVendor reload after creation:
    profileRepo.findOne
      .mockResolvedValueOnce(null) // duplicate check
      .mockResolvedValue({
        id: 'vp1',
        status: VendorStatus.PENDING_REVIEW,
        servedUniversities: [],
      });

    await svc.applyAsStudent('user1', dto);

    const savedProfile = managerStub.save.mock.calls
      .map((c: any[]) => c[0])
      .find((o: any) => o.businessName === 'Print Hub');
    expect(savedProfile.status).toBe(VendorStatus.PENDING_REVIEW);
    expect(savedProfile.shopfrontPhotoUrl).toBe(dto.shopfrontPhotoUrl);
    expect(savedProfile.submittedAt).toBeInstanceOf(Date);

    const servedRows = managerStub.save.mock.calls
      .map((c: any[]) => c[0])
      .filter((o: any) => o.universityId);
    expect(servedRows.map((r: any) => r.universityId).sort()).toEqual([
      'u1',
      'u2',
    ]);
  });
});

describe('VendorsService.submitForReview', () => {
  const submitDto = {
    shopfrontPhotoUrl: 'https://cdn.example.com/live.jpg',
    photoCapturedLive: true,
  };

  it.each([VendorStatus.DRAFT, VendorStatus.REJECTED])(
    'moves %s → PENDING_REVIEW with a fresh submittedAt',
    async (status) => {
      const profile: any = { id: 'vp1', status, rejectionReason: 'old' };
      const { svc, profileRepo } = makeService({ profile });
      profileRepo.findOne
        .mockResolvedValueOnce(profile)
        .mockResolvedValue({ ...profile, servedUniversities: [] });

      await svc.submitForReview('user1', submitDto as any);

      expect(profile.status).toBe(VendorStatus.PENDING_REVIEW);
      expect(profile.shopfrontPhotoUrl).toBe(submitDto.shopfrontPhotoUrl);
      expect(profile.submittedAt).toBeInstanceOf(Date);
      expect(profile.rejectionReason).toBeNull();
    },
  );

  it.each([
    VendorStatus.PENDING_REVIEW,
    VendorStatus.ACTIVE,
    VendorStatus.SUSPENDED,
  ])('400s from status %s', async (status) => {
    const { svc } = makeService({ profile: { id: 'vp1', status } as any });
    await expect(
      svc.submitForReview('user1', submitDto as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('VendorsService admin review-state machine', () => {
  function adminService(status: VendorStatus) {
    const profile: any = {
      id: 'vp1',
      userId: 'user1',
      businessName: 'Print Hub',
      status,
    };
    const made = makeService({ profile });
    // getAdminDetail reload:
    made.profileRepo.findOne.mockImplementation(async () => profile);
    return { ...made, profile };
  }

  it('approve: PENDING_REVIEW → ACTIVE + notification', async () => {
    const { svc, profile, notificationsService } = adminService(
      VendorStatus.PENDING_REVIEW,
    );
    await svc.approve('vp1', 'admin1');
    expect(profile.status).toBe(VendorStatus.ACTIVE);
    expect(profile.reviewedBy).toBe('admin1');
    expect(notificationsService.createNotification).toHaveBeenCalled();
  });

  it('approve 400s outside PENDING_REVIEW', async () => {
    const { svc } = adminService(VendorStatus.DRAFT);
    await expect(svc.approve('vp1', 'admin1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reject: PENDING_REVIEW → REJECTED with reason', async () => {
    const { svc, profile } = adminService(VendorStatus.PENDING_REVIEW);
    await svc.reject('vp1', 'admin1', 'blurry photo');
    expect(profile.status).toBe(VendorStatus.REJECTED);
    expect(profile.rejectionReason).toBe('blurry photo');
  });

  it('suspend requires ACTIVE; reactivate requires SUSPENDED', async () => {
    const active = adminService(VendorStatus.ACTIVE);
    await active.svc.suspend('vp1', 'admin1', 'fraud reports');
    expect(active.profile.status).toBe(VendorStatus.SUSPENDED);
    expect(active.profile.suspensionReason).toBe('fraud reports');

    await active.svc.reactivate('vp1', 'admin1');
    expect(active.profile.status).toBe(VendorStatus.ACTIVE);
    expect(active.profile.suspensionReason).toBeNull();

    const draft = adminService(VendorStatus.DRAFT);
    await expect(
      draft.svc.suspend('vp1', 'admin1', 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifyCac 400s without submitted CAC details, sets the badge with them', async () => {
    const bare = adminService(VendorStatus.ACTIVE);
    await expect(bare.svc.verifyCac('vp1', 'admin1')).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const withCac = adminService(VendorStatus.ACTIVE);
    withCac.profile.cacNumber = 'BN1234567';
    withCac.profile.cacDocumentUrl = 'https://cdn.example.com/cac.pdf';
    await withCac.svc.verifyCac('vp1', 'admin1');
    expect(withCac.profile.isVerified).toBe(true);
  });

  it('admin decision still succeeds when the notification fails', async () => {
    const { svc, profile, notificationsService } = adminService(
      VendorStatus.PENDING_REVIEW,
    );
    notificationsService.createNotification.mockRejectedValue(
      new Error('push down'),
    );
    await svc.approve('vp1', 'admin1');
    expect(profile.status).toBe(VendorStatus.ACTIVE);
  });
});

describe('VendorsService.updateMyProfile', () => {
  it('freezes suspended profiles', async () => {
    const { svc } = makeService({
      profile: { id: 'vp1', status: VendorStatus.SUSPENDED } as any,
    });
    await expect(
      svc.updateMyProfile('user1', { businessName: 'New Name' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('re-validates the selection when served universities change', async () => {
    const profile: any = {
      id: 'vp1',
      status: VendorStatus.ACTIVE,
      homeUniversityId: 'u1',
      servedUniversities: [{ universityId: 'u1' }],
    };
    const { svc } = makeService({ profile });
    await expect(
      // new served list drops the home university → invariant violated
      svc.updateMyProfile('user1', { servedUniversityIds: ['u2'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
