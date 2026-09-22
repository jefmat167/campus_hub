import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { BuyRequestsService } from './buy-requests.service';
import {
  BuyRequest,
  BuyRequestStatus,
} from '../../database/entities/buy-request.entity';
import { VisibilityScope } from '../../database/entities/listing.entity';

/**
 * Closing a buy request (cancel or manual fulfil) must cascade to its offers:
 * every PENDING offer becomes REJECTED in the same transaction, and the flip
 * itself is conditional on the request still being OPEN. Before this, a
 * cancelled request kept live offers that the requester could still accept.
 */
function makeRequest(overrides: Partial<any> = {}): any {
  return {
    id: 'br1',
    requesterId: 'r1',
    title: 'Need a desk lamp',
    status: BuyRequestStatus.OPEN,
    ...overrides,
  };
}

const UNI = 'uni-1';
const FAC = 'fac-1';
const DEP = 'dep-1';

function makeService(
  buyRequest: any,
  opts: {
    flipAffected?: number;
    rejected?: any[];
    user?: any;
    faculties?: Record<string, any>;
    departments?: Record<string, any>;
  } = {},
) {
  const manager: any = {
    update: jest.fn(async () => ({ affected: opts.flipAffected ?? 1 })),
  };
  const queryRunner: any = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    manager,
  };
  const buyRequestRepository: any = {
    findOne: jest.fn(async () => buyRequest),
    update: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => ({ id: 'br-new', ...data })),
  };
  const userRepository: any = {
    findOne: jest.fn(async () => opts.user ?? null),
  };
  const faculties = opts.faculties ?? { [FAC]: { id: FAC, universityId: UNI } };
  const departments = opts.departments ?? { [DEP]: { id: DEP, facultyId: FAC } };
  const facultyRepository: any = {
    findOne: jest.fn(async ({ where }: any) => faculties[where.id] ?? null),
  };
  const departmentRepository: any = {
    findOne: jest.fn(async ({ where }: any) => departments[where.id] ?? null),
  };
  const offersService: any = {
    rejectPendingOffersForRequest: jest.fn(async () => opts.rejected ?? []),
    notifyOffersRejected: jest.fn(async () => {}),
  };
  const dataSource: any = { createQueryRunner: jest.fn(() => queryRunner) };

  const svc = new BuyRequestsService(
    buyRequestRepository,
    userRepository,
    facultyRepository,
    departmentRepository,
    offersService,
    dataSource,
  );
  return { svc, manager, queryRunner, buyRequestRepository, offersService, dataSource };
}

const student = (overrides: Partial<any> = {}) => ({
  id: 'r1',
  universityId: UNI,
  facultyId: FAC,
  departmentId: DEP,
  ...overrides,
});

const baseDto = (overrides: Partial<any> = {}): any => ({
  title: 'Need a desk lamp',
  description: 'Any working desk lamp for late-night reading, ideally LED.',
  category: 'furniture',
  budgetMin: 5000,
  budgetMax: 20000,
  ...overrides,
});

describe('BuyRequestsService.createBuyRequest — visibility scope targets', () => {
  it('defaults a FACULTY-scoped request to the requester\'s own faculty', async () => {
    const { svc, buyRequestRepository } = makeService(
      { id: 'br-new', requesterId: 'r1', requester: null },
      { user: student() },
    );

    await svc.createBuyRequest('r1', baseDto({ visibilityScope: VisibilityScope.FACULTY }));

    expect(buyRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        visibilityScope: VisibilityScope.FACULTY,
        facultyId: FAC,
        departmentId: null,
        universityId: UNI,
      }),
    );
  });

  it('defaults a DEPARTMENT-scoped request to the requester\'s department AND its faculty', async () => {
    const { svc, buyRequestRepository } = makeService(
      { id: 'br-new', requesterId: 'r1', requester: null },
      { user: student() },
    );

    await svc.createBuyRequest('r1', baseDto({ visibilityScope: VisibilityScope.DEPARTMENT }));

    expect(buyRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ facultyId: FAC, departmentId: DEP }),
    );
  });

  it('derives the faculty from an explicit department', async () => {
    const { svc, buyRequestRepository } = makeService(
      { id: 'br-new', requesterId: 'r1', requester: null },
      {
        user: student({ facultyId: null, departmentId: null }),
        faculties: { 'fac-9': { id: 'fac-9', universityId: UNI } },
        departments: { 'dep-9': { id: 'dep-9', facultyId: 'fac-9' } },
      },
    );

    await svc.createBuyRequest(
      'r1',
      baseDto({ visibilityScope: VisibilityScope.DEPARTMENT, departmentId: 'dep-9' }),
    );

    expect(buyRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ facultyId: 'fac-9', departmentId: 'dep-9' }),
    );
  });

  it('400s a FACULTY scope when neither the request nor the profile names a faculty', async () => {
    const { svc, buyRequestRepository } = makeService(null, {
      user: student({ facultyId: null, departmentId: null }),
    });

    await expect(
      svc.createBuyRequest('r1', baseDto({ visibilityScope: VisibilityScope.FACULTY })),
    ).rejects.toThrow(/faculty is required/i);
    expect(buyRequestRepository.save).not.toHaveBeenCalled();
  });

  it('400s a faculty from another university', async () => {
    const { svc } = makeService(null, {
      user: student(),
      faculties: { 'fac-other': { id: 'fac-other', universityId: 'uni-2' } },
    });

    await expect(
      svc.createBuyRequest(
        'r1',
        baseDto({ visibilityScope: VisibilityScope.FACULTY, facultyId: 'fac-other' }),
      ),
    ).rejects.toThrow(/does not belong to your university/i);
  });

  it('400s a department that is not in the given faculty', async () => {
    const { svc } = makeService(null, {
      user: student(),
      faculties: { [FAC]: { id: FAC, universityId: UNI }, 'fac-2': { id: 'fac-2', universityId: UNI } },
      departments: { 'dep-2': { id: 'dep-2', facultyId: 'fac-2' } },
    });

    await expect(
      svc.createBuyRequest('r1', baseDto({ facultyId: FAC, departmentId: 'dep-2' })),
    ).rejects.toThrow(/does not belong to the given faculty/i);
  });

  it('leaves UNIVERSITY-scoped requests unpinned unless ids are given', async () => {
    const { svc, buyRequestRepository } = makeService(
      { id: 'br-new', requesterId: 'r1', requester: null },
      { user: student() },
    );

    await svc.createBuyRequest('r1', baseDto());

    expect(buyRequestRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ facultyId: null, departmentId: null }),
    );
  });

  it('strips the requester\'s email and phone from the response', async () => {
    const { svc } = makeService(
      {
        id: 'br-new',
        requesterId: 'r1',
        requester: {
          id: 'r1',
          fullName: 'Ada',
          email: 'ada@test.ng',
          phone: '2348000000000',
          verificationTier: 'tier_1',
          faculty: null,
          department: null,
        },
      },
      { user: student() },
    );

    const result: any = await svc.createBuyRequest('r1', baseDto());

    expect(result.requester.fullName).toBe('Ada');
    expect(result.requester.email).toBeUndefined();
    expect(result.requester.phone).toBeUndefined();
  });
});

describe('BuyRequestsService.updateBuyRequest — scope re-resolution', () => {
  it('pins the faculty when the scope is narrowed to FACULTY on update', async () => {
    const existing = {
      id: 'br1',
      requesterId: 'r1',
      universityId: UNI,
      status: BuyRequestStatus.OPEN,
      visibilityScope: VisibilityScope.UNIVERSITY,
      facultyId: null,
      departmentId: null,
      budgetMin: 5000,
      budgetMax: 20000,
      requester: null,
    };
    const { svc, buyRequestRepository } = makeService(existing, { user: student() });

    await svc.updateBuyRequest('br1', 'r1', { visibilityScope: VisibilityScope.FACULTY } as any);

    expect(buyRequestRepository.update).toHaveBeenCalledWith(
      'br1',
      expect.objectContaining({ visibilityScope: VisibilityScope.FACULTY, facultyId: FAC }),
    );
  });
});

describe('BuyRequestsService.cancelBuyRequest', () => {
  it('flips OPEN→CANCELLED conditionally and rejects pending offers in the same transaction', async () => {
    const rejected = [
      { id: 'o1', responderId: 's1', conversationId: 'c1', buyRequest: { title: 'Need a desk lamp' } },
    ];
    const { svc, manager, queryRunner, offersService, buyRequestRepository } = makeService(
      makeRequest(),
      { rejected },
    );

    await svc.cancelBuyRequest('br1', 'r1');

    expect(manager.update).toHaveBeenCalledWith(
      BuyRequest,
      { id: 'br1', status: BuyRequestStatus.OPEN },
      { status: BuyRequestStatus.CANCELLED },
    );
    expect(offersService.rejectPendingOffersForRequest).toHaveBeenCalledWith(
      'br1',
      expect.any(Date),
      manager,
    );
    // Cascade ran inside the transaction, notification after commit
    const commitAt = queryRunner.commitTransaction.mock.invocationCallOrder[0];
    expect(
      offersService.rejectPendingOffersForRequest.mock.invocationCallOrder[0],
    ).toBeLessThan(commitAt);
    expect(offersService.notifyOffersRejected.mock.invocationCallOrder[0]).toBeGreaterThan(
      commitAt,
    );
    // The plain repository update path is gone — the flip is transactional
    expect(buyRequestRepository.update).not.toHaveBeenCalled();

    const [offers, copy] = offersService.notifyOffersRejected.mock.calls[0];
    expect(offers).toBe(rejected);
    expect(copy.chatType).toBe('request_cancelled');
    expect(copy.body(rejected[0])).toContain('Need a desk lamp');
  });

  it('400s when the request is not open, without opening a transaction', async () => {
    const { svc, dataSource } = makeService(
      makeRequest({ status: BuyRequestStatus.FULFILLED }),
    );

    await expect(svc.cancelBuyRequest('br1', 'r1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });

  it('403s for a non-owner', async () => {
    const { svc } = makeService(makeRequest());

    await expect(svc.cancelBuyRequest('br1', 'someone-else')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('loses the race with a concurrent accept: Conflict, rollback, no notices', async () => {
    const { svc, queryRunner, offersService } = makeService(makeRequest(), {
      flipAffected: 0,
    });

    await expect(svc.cancelBuyRequest('br1', 'r1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(offersService.rejectPendingOffersForRequest).not.toHaveBeenCalled();
    expect(offersService.notifyOffersRejected).not.toHaveBeenCalled();
  });
});

describe('BuyRequestsService.markAsFulfilled', () => {
  it('flips OPEN→FULFILLED with the same cascade and returns the request', async () => {
    const rejected = [{ id: 'o1', responderId: 's1', conversationId: null, buyRequest: null }];
    const { svc, manager, offersService, buyRequestRepository } = makeService(makeRequest(), {
      rejected,
    });

    const result = await svc.markAsFulfilled('br1', 'r1');

    expect(manager.update).toHaveBeenCalledWith(
      BuyRequest,
      { id: 'br1', status: BuyRequestStatus.OPEN },
      { status: BuyRequestStatus.FULFILLED },
    );
    expect(offersService.rejectPendingOffersForRequest).toHaveBeenCalledWith(
      'br1',
      expect.any(Date),
      manager,
    );
    const [, copy] = offersService.notifyOffersRejected.mock.calls[0];
    expect(copy.chatType).toBe('request_fulfilled');
    // Falls back to the request's own title when the offer relation is missing
    expect(copy.body(rejected[0])).toContain('Need a desk lamp');
    // Re-reads with relations for the response
    expect(buyRequestRepository.findOne).toHaveBeenLastCalledWith(
      expect.objectContaining({ relations: expect.arrayContaining(['requester']) }),
    );
    expect(result).toBeDefined();
  });

  it('400s when the request is not open', async () => {
    const { svc } = makeService(makeRequest({ status: BuyRequestStatus.CANCELLED }));

    await expect(svc.markAsFulfilled('br1', 'r1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
