import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, Brackets, DataSource } from 'typeorm';
import { toKobo } from '../../common/utils/money';
import {
  BuyRequest,
  BuyRequestStatus,
  RequestUrgency,
} from '../../database/entities/buy-request.entity';
import { BuyRequestOffer } from '../../database/entities/buy-request-offer.entity';
import { VisibilityScope } from '../../database/entities/listing.entity';
import { User } from '../../database/entities/user.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';
import { BuyRequestOffersService } from './buy-request-offers.service';
import {
  CreateBuyRequestDto,
  UpdateBuyRequestDto,
  BuyRequestQueryDto,
  BuyRequestSortBy,
  PaginatedBuyRequestsResponseDto,
} from './dto';

@Injectable()
export class BuyRequestsService {
  constructor(
    @InjectRepository(BuyRequest)
    private readonly buyRequestRepository: Repository<BuyRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Faculty)
    private readonly facultyRepository: Repository<Faculty>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly buyRequestOffersService: BuyRequestOffersService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Public requester card. No email / phone: the browse feed is visible to
   * every student on campus, and contact happens through the chat thread the
   * offer creates (the marketplace seller card still carries contact details —
   * a seller advertises; a requester merely asks).
   */
  private sanitizeRequester(requester: User): Record<string, any> {
    if (!requester) return requester;

    return {
      id: requester.id,
      fullName: requester.fullName,
      profilePhotoUrl: requester.profilePhotoUrl,
      verificationTier: requester.verificationTier,
      faculty: requester.faculty
        ? { id: requester.faculty.id, name: requester.faculty.name, code: requester.faculty.code }
        : null,
      department: requester.department
        ? { id: requester.department.id, name: requester.department.name, code: requester.department.code }
        : null,
    };
  }

  /**
   * Sanitize requester in a buy request object
   */
  private sanitizeBuyRequestRequester(buyRequest: BuyRequest): BuyRequest {
    if (buyRequest.requester) {
      (buyRequest as any).requester = this.sanitizeRequester(buyRequest.requester);
    }
    return buyRequest;
  }

  /**
   * Sanitize requesters in an array of buy requests
   */
  private sanitizeBuyRequestsRequesters(buyRequests: BuyRequest[]): BuyRequest[] {
    return buyRequests.map((request) => this.sanitizeBuyRequestRequester(request));
  }

  async createBuyRequest(userId: string, dto: CreateBuyRequestDto): Promise<BuyRequest> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'universityId', 'facultyId', 'departmentId', 'verificationTier'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Vendor-only accounts have no academic identity (rev-2 01.5); the
    // controller guard blocks them, this is defence in depth + narrows the type.
    if (!user.universityId) {
      throw new ForbiddenException('Only student accounts can create buy requests');
    }

    // Validate budgetMax >= budgetMin if both provided
    if (dto.budgetMax !== undefined && dto.budgetMax < dto.budgetMin) {
      throw new BadRequestException('Maximum budget must be greater than or equal to minimum budget');
    }

    const { facultyId, departmentId } = await this.resolveScopeTargets(
      {
        universityId: user.universityId,
        facultyId: user.facultyId,
        departmentId: user.departmentId,
      },
      dto.visibilityScope ?? VisibilityScope.UNIVERSITY,
      dto.facultyId,
      dto.departmentId,
    );

    // Create the buy request
    const buyRequest = this.buyRequestRepository.create({
      ...dto,
      requesterId: userId,
      universityId: user.universityId,
      facultyId,
      departmentId,
      status: BuyRequestStatus.OPEN,
    });

    const savedRequest = await this.buyRequestRepository.save(buyRequest);

    return this.getBuyRequestById(savedRequest.id, userId);
  }

  /**
   * Pin a request to the faculty / department its visibility scope names.
   * `applyVisibilityFilter` matches FACULTY-scoped requests on
   * `request.facultyId = viewer.facultyId` (same for DEPARTMENT), so a scoped
   * request WITHOUT an id was visible to nobody but its owner. Default the ids
   * from the requester's own academic identity, derive the faculty from a
   * department, and refuse ids outside the requester's university / faculty.
   */
  private async resolveScopeTargets(
    user: { universityId: string; facultyId?: string | null; departmentId?: string | null },
    scope: VisibilityScope,
    facultyIdInput: string | null | undefined,
    departmentIdInput: string | null | undefined,
  ): Promise<{ facultyId: string | null; departmentId: string | null }> {
    let facultyId = facultyIdInput ?? null;
    let departmentId = departmentIdInput ?? null;

    if (scope === VisibilityScope.DEPARTMENT) {
      departmentId = departmentId ?? user.departmentId ?? null;
      if (!departmentId) {
        throw new BadRequestException(
          'A department is required for a department-scoped request — set one on your profile or pass departmentId',
        );
      }
    }

    if (departmentId) {
      const department = await this.departmentRepository.findOne({
        where: { id: departmentId },
      });
      if (!department) {
        throw new BadRequestException('Department not found');
      }
      if (facultyId && department.facultyId !== facultyId) {
        throw new BadRequestException('Department does not belong to the given faculty');
      }
      facultyId = facultyId ?? department.facultyId;
    }

    if (scope === VisibilityScope.FACULTY) {
      facultyId = facultyId ?? user.facultyId ?? null;
      if (!facultyId) {
        throw new BadRequestException(
          'A faculty is required for a faculty-scoped request — set one on your profile or pass facultyId',
        );
      }
    }

    if (facultyId) {
      const faculty = await this.facultyRepository.findOne({
        where: { id: facultyId },
      });
      if (!faculty) {
        throw new BadRequestException('Faculty not found');
      }
      if (faculty.universityId !== user.universityId) {
        throw new BadRequestException('Faculty does not belong to your university');
      }
    }

    return { facultyId, departmentId };
  }

  async updateBuyRequest(
    requestId: string,
    userId: string,
    dto: UpdateBuyRequestDto,
  ): Promise<BuyRequest> {
    const buyRequest = await this.buyRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!buyRequest) {
      throw new NotFoundException('Buy request not found');
    }

    if (buyRequest.requesterId !== userId) {
      throw new ForbiddenException('You can only update your own buy requests');
    }

    if (buyRequest.status !== BuyRequestStatus.OPEN) {
      throw new BadRequestException('Only open buy requests can be updated');
    }

    // Validate budgetMax >= budgetMin if both provided
    const newBudgetMin = dto.budgetMin ?? buyRequest.budgetMin;
    const newBudgetMax = dto.budgetMax ?? buyRequest.budgetMax;
    if (newBudgetMax !== null && newBudgetMax < newBudgetMin) {
      throw new BadRequestException('Maximum budget must be greater than or equal to minimum budget');
    }

    // Re-resolve the scope targets against the merged state, so a scope change
    // (or a new faculty/department) is validated exactly like on create.
    const requester = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'universityId', 'facultyId', 'departmentId'],
    });
    const { facultyId, departmentId } = await this.resolveScopeTargets(
      { ...requester, universityId: buyRequest.universityId },
      dto.visibilityScope ?? buyRequest.visibilityScope,
      dto.facultyId ?? buyRequest.facultyId,
      dto.departmentId ?? buyRequest.departmentId,
    );

    await this.buyRequestRepository.update(requestId, {
      ...dto,
      facultyId,
      departmentId,
    });

    return this.getBuyRequestById(requestId, userId);
  }

  async getBuyRequestById(requestId: string, userId?: string): Promise<BuyRequest> {
    const buyRequest = await this.buyRequestRepository.findOne({
      where: { id: requestId },
      relations: [
        'requester',
        'requester.faculty',
        'requester.department',
        'university',
        'faculty',
        'department',
      ],
    });

    if (!buyRequest) {
      throw new NotFoundException('Buy request not found');
    }

    return this.sanitizeBuyRequestRequester(buyRequest);
  }

  async getBuyRequestByIdAndIncrementViews(requestId: string, userId?: string): Promise<BuyRequest> {
    const buyRequest = await this.getBuyRequestById(requestId, userId);

    // Increment view count
    await this.buyRequestRepository.increment({ id: requestId }, 'viewCount', 1);
    buyRequest.viewCount += 1;

    return buyRequest;
  }

  async searchBuyRequests(
    query: BuyRequestQueryDto,
    currentUser?: User,
  ): Promise<PaginatedBuyRequestsResponseDto> {
    const qb = this.buyRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.requester', 'requester')
      .leftJoinAndSelect('requester.faculty', 'requesterFaculty')
      .leftJoinAndSelect('requester.department', 'requesterDepartment')
      .leftJoinAndSelect('request.university', 'university');

    // Apply visibility scope filtering based on current user (an account
    // without a university — vendor-only — falls back to the anonymous view)
    if (currentUser?.universityId) {
      this.applyVisibilityFilter(qb, currentUser);
    } else {
      // Only show university-wide requests for non-authenticated users
      qb.andWhere('request.visibilityScope = :scope', {
        scope: VisibilityScope.UNIVERSITY,
      });
    }

    // Apply status filter (default to OPEN)
    qb.andWhere('request.status = :status', {
      status: query.status || BuyRequestStatus.OPEN,
    });

    // Narrow to one scope level (within what the viewer may see)
    if (query.visibilityScope) {
      qb.andWhere('request.visibilityScope = :visibilityScopeFilter', {
        visibilityScopeFilter: query.visibilityScope,
      });
    }

    // Search by text
    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('request.title ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('request.description ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    // Filter by category
    if (query.category) {
      qb.andWhere('request.category = :category', {
        category: query.category,
      });
    } else if (query.categories && query.categories.length > 0) {
      qb.andWhere('request.category IN (:...categories)', {
        categories: query.categories,
      });
    }

    // Filter by urgency
    if (query.urgency) {
      qb.andWhere('request.urgency = :urgency', {
        urgency: query.urgency,
      });
    } else if (query.urgencies && query.urgencies.length > 0) {
      qb.andWhere('request.urgency IN (:...urgencies)', {
        urgencies: query.urgencies,
      });
    }

    // Filter by budget range (finds requests that overlap with the query range)
    if (query.minBudget !== undefined) {
      const minBudget = query.minBudget;
      // Request's max budget (or min if no max) should be >= query's min
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('request.budgetMax >= :minBudget', { minBudget: toKobo(minBudget) })
            .orWhere(
              new Brackets((innerQb) => {
                innerQb
                  .where('request.budgetMax IS NULL')
                  .andWhere('request.budgetMin >= :minBudget', { minBudget: toKobo(minBudget) });
              }),
            );
        }),
      );
    }
    if (query.maxBudget !== undefined) {
      // Request's min budget should be <= query's max
      qb.andWhere('request.budgetMin <= :maxBudget', { maxBudget: toKobo(query.maxBudget) });
    }

    // Filter by university
    if (query.universityId) {
      qb.andWhere('request.universityId = :universityId', {
        universityId: query.universityId,
      });
    }

    // Filter by faculty
    if (query.facultyId) {
      qb.andWhere('request.facultyId = :facultyId', {
        facultyId: query.facultyId,
      });
    }

    // Filter by department
    if (query.departmentId) {
      qb.andWhere('request.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }

    // Filter by requester
    if (query.requesterId) {
      qb.andWhere('request.requesterId = :requesterId', {
        requesterId: query.requesterId,
      });
    }

    // Apply sorting
    this.applySorting(qb, query.sortBy);

    // Get total count
    const total = await qb.getCount();

    // Apply pagination
    const limit = query.limit || 20;
    const page = query.page || 1;
    const offset = (page - 1) * limit;

    qb.skip(offset).take(limit);

    const requests = await qb.getMany();

    // Sanitize requester data in all requests
    const sanitizedRequests = this.sanitizeBuyRequestsRequesters(requests);

    const totalPages = Math.ceil(total / limit);

    return {
      requests: sanitizedRequests,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  private applyVisibilityFilter(qb: SelectQueryBuilder<BuyRequest>, user: User): void {
    qb.andWhere(
      new Brackets((subQb) => {
        // University-wide requests from same university
        subQb.where(
          new Brackets((uniQb) => {
            uniQb
              .where('request.visibilityScope = :uniScope', {
                uniScope: VisibilityScope.UNIVERSITY,
              })
              .andWhere('request.universityId = :userUniId', {
                userUniId: user.universityId,
              });
          }),
        );

        // Faculty-wide requests from same faculty
        if (user.facultyId) {
          subQb.orWhere(
            new Brackets((facQb) => {
              facQb
                .where('request.visibilityScope = :facScope', {
                  facScope: VisibilityScope.FACULTY,
                })
                .andWhere('request.facultyId = :userFacId', {
                  userFacId: user.facultyId,
                });
            }),
          );
        }

        // Department-wide requests from same department
        if (user.departmentId) {
          subQb.orWhere(
            new Brackets((deptQb) => {
              deptQb
                .where('request.visibilityScope = :deptScope', {
                  deptScope: VisibilityScope.DEPARTMENT,
                })
                .andWhere('request.departmentId = :userDeptId', {
                  userDeptId: user.departmentId,
                });
            }),
          );
        }

        // User's own requests regardless of scope
        subQb.orWhere('request.requesterId = :userId', { userId: user.id });
      }),
    );
  }

  private applySorting(
    qb: SelectQueryBuilder<BuyRequest>,
    sortBy?: BuyRequestSortBy,
  ): void {
    switch (sortBy) {
      case BuyRequestSortBy.BUDGET_ASC:
        qb.orderBy('request.budgetMin', 'ASC');
        break;
      case BuyRequestSortBy.BUDGET_DESC:
        qb.orderBy('request.budgetMin', 'DESC');
        break;
      case BuyRequestSortBy.VIEWS:
        qb.orderBy('request.viewCount', 'DESC');
        break;
      case BuyRequestSortBy.URGENCY:
        // Order by urgency: ASAP first, then WITHIN_A_WEEK, then FLEXIBLE
        qb.orderBy(
          `CASE request.urgency
            WHEN '${RequestUrgency.ASAP}' THEN 1
            WHEN '${RequestUrgency.WITHIN_A_WEEK}' THEN 2
            WHEN '${RequestUrgency.FLEXIBLE}' THEN 3
            ELSE 4
          END`,
          'ASC',
        );
        break;
      case BuyRequestSortBy.CREATED_AT:
      default:
        qb.orderBy('request.createdAt', 'DESC');
        break;
    }

    // Secondary sort by id for consistent pagination
    qb.addOrderBy('request.id', 'ASC');
  }

  /** Soft delete: status → CANCELLED, and every pending offer on it is rejected. */
  async cancelBuyRequest(requestId: string, userId: string): Promise<void> {
    await this.closeBuyRequest(requestId, userId, BuyRequestStatus.CANCELLED);
  }

  /** Requester closes the request themselves; pending offers are rejected. */
  async markAsFulfilled(requestId: string, userId: string): Promise<BuyRequest> {
    await this.closeBuyRequest(requestId, userId, BuyRequestStatus.FULFILLED);
    return this.getBuyRequestById(requestId, userId);
  }

  /**
   * Close an OPEN request (cancel or manual fulfil) in ONE transaction with the
   * cascade to its offers: the request flips via a conditional update (0 rows
   * → someone else closed it first, e.g. an accept landing concurrently) and
   * every PENDING offer becomes REJECTED. Losers are notified after commit.
   * Without the cascade, a closed request kept live offers that could still
   * be accepted — creating an escrow on a cancelled request.
   */
  private async closeBuyRequest(
    requestId: string,
    userId: string,
    target: BuyRequestStatus.CANCELLED | BuyRequestStatus.FULFILLED,
  ): Promise<void> {
    const cancelling = target === BuyRequestStatus.CANCELLED;

    const buyRequest = await this.buyRequestRepository.findOne({
      where: { id: requestId },
    });

    if (!buyRequest) {
      throw new NotFoundException('Buy request not found');
    }

    if (buyRequest.requesterId !== userId) {
      throw new ForbiddenException(
        cancelling
          ? 'You can only cancel your own buy requests'
          : 'You can only update your own buy requests',
      );
    }

    if (buyRequest.status !== BuyRequestStatus.OPEN) {
      throw new BadRequestException(
        cancelling
          ? 'Only open buy requests can be cancelled'
          : 'Only open buy requests can be marked as fulfilled',
      );
    }

    const now = new Date();
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let rejectedOffers: BuyRequestOffer[] = [];
    try {
      const flip = await queryRunner.manager.update(
        BuyRequest,
        { id: requestId, status: BuyRequestStatus.OPEN },
        { status: target },
      );
      if (!flip.affected) {
        throw new ConflictException('This buy request is no longer open');
      }

      rejectedOffers = await this.buyRequestOffersService.rejectPendingOffersForRequest(
        requestId,
        now,
        queryRunner.manager,
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.buyRequestOffersService.notifyOffersRejected(
      rejectedOffers,
      cancelling
        ? {
            chatText: 'This buy request has been cancelled by the requester.',
            chatType: 'request_cancelled',
            title: 'Buy request cancelled',
            body: (o) =>
              `"${o.buyRequest?.title ?? buyRequest.title}" was cancelled by the requester, so your offer is no longer active.`,
          }
        : {
            chatText: 'The requester marked this buy request as fulfilled.',
            chatType: 'request_fulfilled',
            title: 'Buy request fulfilled',
            body: (o) =>
              `The requester closed "${o.buyRequest?.title ?? buyRequest.title}" as fulfilled, so your offer is no longer active.`,
          },
    );
  }

  async getUserBuyRequests(
    userId: string,
    status?: BuyRequestStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedBuyRequestsResponseDto> {
    const offset = (page - 1) * limit;

    const whereClause: any = { requesterId: userId };
    if (status) {
      whereClause.status = status;
    }

    const [requests, total] = await this.buyRequestRepository.findAndCount({
      where: whereClause,
      relations: ['university'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      requests,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }
}
