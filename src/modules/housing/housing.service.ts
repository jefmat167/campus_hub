import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, DataSource } from 'typeorm';
import {
  HousingListing,
  HousingStatus,
} from '../../database/entities/housing.entity';
import {
  HousingReport,
  HousingReportReason,
} from '../../database/entities/housing-report.entity';
import { User } from '../../database/entities/user.entity';
import { CreateHousingDto, SearchHousingDto } from './dto';

export const HOUSING_EXPIRY_DAYS = 30;
export const HOUSING_ACTIVE_LISTING_CAP = 3;
export const HOUSING_REPORT_THRESHOLD = 3;

@Injectable()
export class HousingService {
  private readonly logger = new Logger(HousingService.name);

  constructor(
    @InjectRepository(HousingListing)
    private housingRepo: Repository<HousingListing>,
    @InjectRepository(HousingReport)
    private reportRepo: Repository<HousingReport>,
    private dataSource: DataSource,
  ) {}

  /**
   * Sanitize poster object to remove sensitive data.
   * Landlord details are NEVER exposed on the platform — only the poster (student) is shown.
   */
  private sanitizePoster(poster: User | null | undefined): Record<string, any> | null {
    if (!poster) return null;

    return {
      id: poster.id,
      fullName: poster.fullName,
      profilePhotoUrl: poster.profilePhotoUrl,
      verificationTier: poster.verificationTier,
      yearOfStudy: poster.yearOfStudy,
    };
  }

  private sanitizeListingPoster(listing: HousingListing): HousingListing {
    if ((listing as any).poster) {
      (listing as any).poster = this.sanitizePoster((listing as any).poster);
    }
    return listing;
  }

  private sanitizeListingsPosters(listings: HousingListing[]): HousingListing[] {
    return listings.map((l) => this.sanitizeListingPoster(l));
  }

  /**
   * Create a new housing listing.
   * Enforces the active listing cap (AVAILABLE + PAUSED) per poster.
   */
  async createListing(
    posterId: string,
    universityId: string,
    dto: CreateHousingDto,
  ): Promise<HousingListing> {
    const activeCount = await this.housingRepo.count({
      where: {
        posterId,
        status: In([HousingStatus.AVAILABLE, HousingStatus.PAUSED]),
      },
    });

    if (activeCount >= HOUSING_ACTIVE_LISTING_CAP) {
      throw new BadRequestException(
        `You already have ${activeCount} active listings (max ${HOUSING_ACTIVE_LISTING_CAP}). Mark one as taken, pause fewer, or let one expire before posting another.`,
      );
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + HOUSING_EXPIRY_DAYS);

    const listing = this.housingRepo.create({
      posterId,
      universityId,
      ...dto,
      availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
      expiresAt,
    });

    const saved = await this.housingRepo.save(listing);
    this.logger.log(`Housing listing ${saved.id} created by user ${posterId}`);

    return saved;
  }

  /**
   * Update a housing listing (owner only).
   */
  async updateListing(
    listingId: string,
    posterId: string,
    dto: Partial<CreateHousingDto>,
  ): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({ where: { id: listingId } });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.posterId !== posterId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    if (listing.status === HousingStatus.DELETED) {
      throw new BadRequestException('Cannot update a deleted listing');
    }

    Object.assign(listing, dto);

    if (dto.availableFrom) {
      listing.availableFrom = new Date(dto.availableFrom);
    }

    return this.housingRepo.save(listing);
  }

  /**
   * Get a housing listing by ID.
   * - Owner can see their listing regardless of status (except DELETED).
   * - Everyone else only sees AVAILABLE.
   * Increments view count for non-owner viewers.
   */
  async getListing(
    listingId: string,
    viewerId: string,
  ): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({
      where: { id: listingId },
      relations: ['poster', 'university'],
    });

    if (!listing || listing.status === HousingStatus.DELETED) {
      throw new NotFoundException('Housing listing not found');
    }

    const isOwner = listing.posterId === viewerId;

    if (!isOwner && listing.status !== HousingStatus.AVAILABLE) {
      throw new NotFoundException('Housing listing not found');
    }

    if (!isOwner) {
      await this.housingRepo.increment({ id: listingId }, 'viewCount', 1);
    }

    return this.sanitizeListingPoster(listing);
  }

  /**
   * Search housing listings (AVAILABLE only, within the viewer's university).
   */
  async searchListings(
    universityId: string,
    dto: SearchHousingDto,
  ): Promise<{ listings: HousingListing[]; total: number }> {
    const {
      search,
      type,
      minPrice,
      maxPrice,
      area,
      bedrooms,
      bathrooms,
      furnishing,
      genderPreference,
      hasWater,
      hasElectricity,
      hasInternet,
      hasGenerator,
      page = 1,
      limit = 20,
      sortBy = 'newest',
    } = dto;

    const queryBuilder = this.housingRepo
      .createQueryBuilder('housing')
      .leftJoinAndSelect('housing.poster', 'poster')
      .where('housing.universityId = :universityId', { universityId })
      .andWhere('housing.status = :status', { status: HousingStatus.AVAILABLE });

    if (search) {
      queryBuilder.andWhere(
        '(housing.title ILIKE :search OR housing.description ILIKE :search OR housing.area ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (type) queryBuilder.andWhere('housing.type = :type', { type });
    if (minPrice !== undefined) queryBuilder.andWhere('housing.price >= :minPrice', { minPrice });
    if (maxPrice !== undefined) queryBuilder.andWhere('housing.price <= :maxPrice', { maxPrice });
    if (area) queryBuilder.andWhere('housing.area ILIKE :area', { area: `%${area}%` });
    if (bedrooms !== undefined) queryBuilder.andWhere('housing.bedrooms >= :bedrooms', { bedrooms });
    if (bathrooms !== undefined) queryBuilder.andWhere('housing.bathrooms >= :bathrooms', { bathrooms });
    if (furnishing) queryBuilder.andWhere('housing.furnishing = :furnishing', { furnishing });
    if (genderPreference) queryBuilder.andWhere('housing.genderPreference = :genderPreference', { genderPreference });
    if (hasWater) queryBuilder.andWhere('housing.hasWater = true');
    if (hasElectricity) queryBuilder.andWhere('housing.hasElectricity = true');
    if (hasInternet) queryBuilder.andWhere('housing.hasInternet = true');
    if (hasGenerator) queryBuilder.andWhere('housing.hasGenerator = true');

    switch (sortBy) {
      case 'price_asc':
        queryBuilder.orderBy('housing.price', 'ASC');
        break;
      case 'price_desc':
        queryBuilder.orderBy('housing.price', 'DESC');
        break;
      case 'popular':
        queryBuilder.orderBy('housing.viewCount', 'DESC');
        break;
      case 'newest':
      default:
        queryBuilder.orderBy('housing.createdAt', 'DESC');
    }

    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [listings, total] = await queryBuilder.getManyAndCount();

    return { listings: this.sanitizeListingsPosters(listings), total };
  }

  /**
   * Get caller's own listings across all non-DELETED statuses.
   */
  async getMyListings(
    posterId: string,
    page = 1,
    limit = 20,
  ): Promise<{ listings: HousingListing[]; total: number }> {
    const [listings, total] = await this.housingRepo.findAndCount({
      where: {
        posterId,
        status: In([
          HousingStatus.AVAILABLE,
          HousingStatus.TAKEN,
          HousingStatus.RESERVED,
          HousingStatus.PAUSED,
          HousingStatus.UNDER_REVIEW,
          HousingStatus.EXPIRED,
        ]),
      },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { listings, total };
  }

  /**
   * Owner-triggered status transitions.
   * Guards against transitioning out of UNDER_REVIEW (moderator-only) or DELETED.
   */
  async updateStatus(
    listingId: string,
    posterId: string,
    status: HousingStatus,
  ): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({ where: { id: listingId } });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.posterId !== posterId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    if (listing.status === HousingStatus.DELETED) {
      throw new BadRequestException('Cannot change status of a deleted listing');
    }

    if (listing.status === HousingStatus.UNDER_REVIEW) {
      throw new BadRequestException(
        'This listing is under moderator review and cannot be modified',
      );
    }

    // Re-activation enforces the active listing cap.
    if (
      status === HousingStatus.AVAILABLE &&
      listing.status !== HousingStatus.AVAILABLE
    ) {
      const activeCount = await this.housingRepo.count({
        where: {
          posterId,
          status: In([HousingStatus.AVAILABLE, HousingStatus.PAUSED]),
        },
      });
      const alreadyCounted =
        listing.status === HousingStatus.PAUSED ? 1 : 0;
      if (activeCount - alreadyCounted >= HOUSING_ACTIVE_LISTING_CAP) {
        throw new BadRequestException(
          `You already have ${HOUSING_ACTIVE_LISTING_CAP} active listings. Mark one as taken or pause fewer before reactivating.`,
        );
      }
    }

    listing.status = status;
    return this.housingRepo.save(listing);
  }

  /**
   * Renew an expiring or expired listing — pushes expiresAt forward by EXPIRY_DAYS.
   * Also reactivates EXPIRED listings back to AVAILABLE.
   */
  async renewListing(
    listingId: string,
    posterId: string,
  ): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({ where: { id: listingId } });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.posterId !== posterId) {
      throw new ForbiddenException('You can only renew your own listings');
    }

    if (
      listing.status !== HousingStatus.AVAILABLE &&
      listing.status !== HousingStatus.EXPIRED
    ) {
      throw new BadRequestException(
        'Only available or expired listings can be renewed',
      );
    }

    // Reactivating an expired listing must respect the active cap.
    if (listing.status === HousingStatus.EXPIRED) {
      const activeCount = await this.housingRepo.count({
        where: {
          posterId,
          status: In([HousingStatus.AVAILABLE, HousingStatus.PAUSED]),
        },
      });
      if (activeCount >= HOUSING_ACTIVE_LISTING_CAP) {
        throw new BadRequestException(
          `You already have ${HOUSING_ACTIVE_LISTING_CAP} active listings. Mark one as taken before renewing this one.`,
        );
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + HOUSING_EXPIRY_DAYS);
    listing.expiresAt = expiresAt;
    listing.status = HousingStatus.AVAILABLE;

    return this.housingRepo.save(listing);
  }

  /**
   * Soft delete a listing (owner only).
   */
  async deleteListing(listingId: string, posterId: string): Promise<void> {
    const listing = await this.housingRepo.findOne({ where: { id: listingId } });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.posterId !== posterId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    listing.status = HousingStatus.DELETED;
    await this.housingRepo.save(listing);
    this.logger.log(`Housing listing ${listingId} deleted by user ${posterId}`);
  }

  /**
   * Increment inquiry count. Called by ChatService when a HOUSING_INQUIRY
   * conversation is newly created (not when an existing one is returned).
   */
  async incrementInquiry(listingId: string): Promise<void> {
    await this.housingRepo.increment({ id: listingId }, 'inquiryCount', 1);
  }

  /**
   * Report a listing. Auto-flips to UNDER_REVIEW when the threshold is hit.
   * One report per reporter per listing (enforced by unique constraint).
   */
  async reportListing(
    listingId: string,
    reporterId: string,
    reason: HousingReportReason,
    details?: string,
  ): Promise<{ reported: boolean; underReview: boolean }> {
    const listing = await this.housingRepo.findOne({ where: { id: listingId } });

    if (!listing || listing.status === HousingStatus.DELETED) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.posterId === reporterId) {
      throw new BadRequestException('You cannot report your own listing');
    }

    if (listing.status !== HousingStatus.AVAILABLE) {
      throw new BadRequestException(
        'Only active listings can be reported',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      try {
        await queryRunner.manager.insert(HousingReport, {
          listingId,
          reporterId,
          reason,
          details: details ?? null,
        });
      } catch (err: any) {
        // Unique violation = already reported
        if (err?.code === '23505') {
          await queryRunner.rollbackTransaction();
          throw new BadRequestException('You have already reported this listing');
        }
        throw err;
      }

      await queryRunner.manager.increment(
        HousingListing,
        { id: listingId },
        'reportCount',
        1,
      );

      const updated = await queryRunner.manager.findOne(HousingListing, {
        where: { id: listingId },
      });

      let underReview = false;
      if (
        updated &&
        updated.reportCount >= HOUSING_REPORT_THRESHOLD &&
        updated.status === HousingStatus.AVAILABLE
      ) {
        await queryRunner.manager.update(
          HousingListing,
          { id: listingId },
          { status: HousingStatus.UNDER_REVIEW },
        );
        underReview = true;
        this.logger.warn(
          `Listing ${listingId} flipped to UNDER_REVIEW after ${updated.reportCount} reports`,
        );
      }

      await queryRunner.commitTransaction();
      return { reported: true, underReview };
    } catch (err) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // --------------------------------------------------------------------------
  // Background job hook
  // --------------------------------------------------------------------------

  /**
   * Flip AVAILABLE listings whose expiry has passed to EXPIRED.
   * Called by the housing processor on a daily schedule.
   */
  async expireStaleListings(): Promise<number> {
    const result = await this.housingRepo
      .createQueryBuilder()
      .update(HousingListing)
      .set({ status: HousingStatus.EXPIRED })
      .where('status = :status', { status: HousingStatus.AVAILABLE })
      .andWhere('expiresAt IS NOT NULL')
      .andWhere('expiresAt < :now', { now: new Date() })
      .execute();

    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(`Expired ${affected} stale housing listings`);
    }
    return affected;
  }

  // --------------------------------------------------------------------------
  // Moderator / admin operations
  // --------------------------------------------------------------------------

  /**
   * List housing listings currently UNDER_REVIEW, with their reports.
   */
  async getReportedListings(
    page = 1,
    limit = 20,
  ): Promise<{
    listings: Array<HousingListing & { reports: HousingReport[] }>;
    total: number;
  }> {
    const [listings, total] = await this.housingRepo.findAndCount({
      where: { status: HousingStatus.UNDER_REVIEW },
      relations: ['poster'],
      order: { updatedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const listingIds = listings.map((l) => l.id);
    const reports = listingIds.length
      ? await this.reportRepo.find({
          where: { listingId: In(listingIds) },
          order: { createdAt: 'DESC' },
        })
      : [];

    const reportsByListing = new Map<string, HousingReport[]>();
    for (const r of reports) {
      const arr = reportsByListing.get(r.listingId) ?? [];
      arr.push(r);
      reportsByListing.set(r.listingId, arr);
    }

    const decorated = listings.map((l) => {
      const sanitized = this.sanitizeListingPoster(l);
      (sanitized as any).reports = reportsByListing.get(l.id) ?? [];
      return sanitized as HousingListing & { reports: HousingReport[] };
    });

    return { listings: decorated, total };
  }

  /**
   * Dismiss reports on a listing and restore it to AVAILABLE.
   */
  async dismissReports(listingId: string): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }
    if (listing.status !== HousingStatus.UNDER_REVIEW) {
      throw new BadRequestException('Listing is not under review');
    }

    listing.status = HousingStatus.AVAILABLE;
    listing.reportCount = 0;
    await this.reportRepo.delete({ listingId });
    this.logger.log(`Reports dismissed for listing ${listingId}`);
    return this.housingRepo.save(listing);
  }

  /**
   * Take a listing down (soft delete) as a moderator action.
   */
  async takeDownListing(listingId: string): Promise<void> {
    const listing = await this.housingRepo.findOne({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }
    if (listing.status === HousingStatus.DELETED) {
      throw new BadRequestException('Listing is already deleted');
    }

    listing.status = HousingStatus.DELETED;
    await this.housingRepo.save(listing);
    this.logger.warn(`Listing ${listingId} taken down by moderator`);
  }
}
