import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  SelectQueryBuilder,
  WhereExpressionBuilder,
  In,
  Brackets,
} from 'typeorm';
import { toKobo } from '../../common/utils/money';
import {
  Listing,
  ListingImage,
  ListingKind,
  ListingStatus,
  VisibilityScope,
} from '../../database/entities/listing.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';
import { VendorMarketService } from '../vendors/vendor-market.service';
import { isListingSoldOut } from '../vendors/vendor-listing.util';
import { Favorite } from '../../database/entities/favorite.entity';
import { User } from '../../database/entities/user.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';
import {
  CreateListingDto,
  UpdateListingDto,
  ListingQueryDto,
  ListingSortBy,
  PaginatedListingsResponseDto,
} from './dto';
import { AdminListListingsDto } from './dto/admin-list-listings.dto';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class MarketplaceService {
  constructor(
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(ListingImage)
    private readonly listingImageRepository: Repository<ListingImage>,
    @InjectRepository(Favorite)
    private readonly favoriteRepository: Repository<Favorite>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Faculty)
    private readonly facultyRepository: Repository<Faculty>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly uploadService: UploadService,
    private readonly vendorMarketService: VendorMarketService,
  ) { }

  /**
   * Sanitize seller object to remove sensitive data
   */
  private sanitizeSeller(seller: User): Record<string, any> {
    if (!seller) return seller;

    return {
      id: seller.id,
      fullName: seller.fullName,
      email: seller.email,
      phone: seller.phone,
      profilePhotoUrl: seller.profilePhotoUrl,
      verificationTier: seller.verificationTier,
      sellerRating: seller.sellerRating,
      sellerRatingCount: seller.sellerRatingCount,
      faculty: seller.faculty
        ? { id: seller.faculty.id, name: seller.faculty.name, code: seller.faculty.code }
        : null,
      department: seller.department
        ? { id: seller.department.id, name: seller.department.name, code: seller.department.code }
        : null,
    };
  }

  /**
   * Sanitize seller in a listing object
   */
  private sanitizeListingSeller(listing: Listing): Listing {
    if (listing.seller) {
      (listing as any).seller = this.sanitizeSeller(listing.seller);
    }
    return listing;
  }

  /**
   * Sanitize sellers in an array of listings
   */
  private sanitizeListingsSellers(listings: Listing[]): Listing[] {
    return listings.map((listing) => this.sanitizeListingSeller(listing));
  }

  /**
   * Public shape for one feed / favorites row on the unified marketplace.
   * P2P rows carry the sanitized seller card. Vendor rows swap the seller card
   * for the BUSINESS (never the owner's personal contact), add `vendor` and
   * `isSoldOut`, and drop the raw vendorProfile relation (CAC numbers,
   * rejection reasons, …) before anything leaves the API.
   */
  private shapeListing(listing: Listing): Listing {
    if (listing.kind === ListingKind.P2P) {
      return this.sanitizeListingSeller(listing);
    }
    const row = listing as any;
    const profile = listing.vendorProfile;
    const owner = listing.seller;
    row.vendor = profile
      ? {
        id: profile.id,
        businessName: profile.businessName,
        isVerified: profile.isVerified,
        homeUniversityId: profile.homeUniversityId,
        shopfrontPhotoUrl: profile.shopfrontPhotoUrl ?? null,
        rating: owner ? Number(owner.sellerRating) : null,
        ratingCount: owner ? owner.sellerRatingCount : null,
      }
      : null;
    row.seller = profile
      ? {
        id: listing.sellerId,
        fullName: profile.businessName,
        profilePhotoUrl: profile.shopfrontPhotoUrl ?? null,
        verificationTier: owner?.verificationTier ?? null,
        sellerRating: owner ? Number(owner.sellerRating) : null,
        sellerRatingCount: owner?.sellerRatingCount ?? null,
        isVendor: true,
      }
      : null;
    row.isSoldOut = isListingSoldOut(listing);
    // Buyers only ever see the derived flag — raw stock figures stay vendor-plane (03.3).
    delete row.stock;
    delete row.vendorProfile;
    return listing;
  }

  private shapeListings(listings: Listing[]): Listing[] {
    return listings.map((listing) => this.shapeListing(listing));
  }

  /** Student-listing writes only — shop items are managed from the vendor catalog. */
  private assertP2p(listing: Listing): void {
    if (listing.kind !== ListingKind.P2P) {
      throw new ForbiddenException(
        'Shop listings are managed from the vendor catalog',
      );
    }
  }

  async createListing(userId: string, dto: CreateListingDto): Promise<Listing> {
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
      throw new ForbiddenException('Only student accounts can create listings');
    }

    // Validate facultyId if provided
    if (dto.facultyId) {
      const faculty = await this.facultyRepository.findOne({
        where: { id: dto.facultyId },
      });
      if (!faculty) {
        throw new BadRequestException('Faculty not found');
      }
    }

    // Validate departmentId if provided
    if (dto.departmentId) {
      const department = await this.departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!department) {
        throw new BadRequestException('Department not found');
      }
    }

    // P2P handover is meet-up only (rev-2 spec 02): >=3 usable public points.
    this.validateMeetupPoints(dto.meetupPoints);

    // Reject before creating anything if an uploaded image's real size differs
    // from what was declared when its presigned URL was issued.
    if (dto.imageUrls && dto.imageUrls.length > 0) {
      await this.uploadService.verifyUploadedFileSizes(dto.imageUrls);
    }

    // Create the listing
    // Only set facultyId/departmentId if explicitly provided in the DTO
    const listing = this.listingRepository.create({
      ...dto,
      kind: ListingKind.P2P,
      isNegotiable: dto.isNegotiable ?? true,
      sellerId: userId,
      universityId: user.universityId,
      facultyId: dto.facultyId ?? null,
      departmentId: dto.departmentId ?? null,
      status: ListingStatus.ACTIVE,
    });

    const savedListing = await this.listingRepository.save(listing);

    // Handle image URLs if provided
    if (dto.imageUrls && dto.imageUrls.length > 0) {
      const images = dto.imageUrls.map((imageUrl, index) =>
        this.listingImageRepository.create({
          listingId: savedListing.id,
          url: imageUrl,
          position: index,
        }),
      );
      await this.listingImageRepository.save(images);

      // Claim R2 uploads so they won't be cleaned up as orphans
      await this.uploadService.claimUploadedFiles(dto.imageUrls);
    }

    return this.getListingById(savedListing.id, userId);
  }

  async updateListing(listingId: string, userId: string, dto: UpdateListingDto): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenException('You can only update your own listings');
    }
    this.assertP2p(listing);

    // Validate facultyId if provided
    if (dto.facultyId) {
      const faculty = await this.facultyRepository.findOne({
        where: { id: dto.facultyId },
      });
      if (!faculty) {
        throw new BadRequestException('Faculty not found');
      }
    }

    // Validate departmentId if provided
    if (dto.departmentId) {
      const department = await this.departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!department) {
        throw new BadRequestException('Department not found');
      }
    }

    // Handle image URL additions if provided
    if (dto.imageUrls !== undefined && dto.imageUrls.length > 0) {
      const existingImages = await this.listingImageRepository.find({
        where: { listingId },
        order: { position: 'DESC' },
      });

      const currentImageCount = existingImages.length;

      if (currentImageCount >= 5) {
        throw new BadRequestException('Listing already has the maximum of 5 images');
      }

      if (currentImageCount + dto.imageUrls.length > 5) {
        throw new BadRequestException(
          `Cannot add ${dto.imageUrls.length} images. Listing has ${currentImageCount} images and maximum is 5`,
        );
      }

      // Determine starting position for new images
      const startPosition = currentImageCount > 0 ? existingImages[0].position + 1 : 0;

      const newImages = dto.imageUrls.map((imageUrl, index) =>
        this.listingImageRepository.create({
          listingId,
          url: imageUrl,
          position: startPosition + index,
        }),
      );

      await this.listingImageRepository.save(newImages);
    }

    // Replacement meet-up points must still satisfy the >=3 rule.
    if (dto.meetupPoints !== undefined) {
      this.validateMeetupPoints(dto.meetupPoints);
    }

    // Remove imageUrls from dto before updating listing
    const { imageUrls, ...updateData } = dto;

    await this.listingRepository.update(listingId, updateData);

    return this.getListingById(listingId, userId);
  }

  /**
   * P2P handover rule (rev-2 spec 02): every listing names at least 3 usable
   * public meet-up points (the DTO enforces shape; this guards trimmed
   * emptiness and any non-DTO caller). Used on create and update.
   */
  private validateMeetupPoints(
    meetupPoints: string[] | null | undefined,
  ): void {
    const usable = (meetupPoints ?? []).filter((p) => p?.trim()).length;
    if (usable < 3) {
      throw new BadRequestException(
        'At least 3 meet-up points are required for a listing',
      );
    }
  }

  async getListingById(listingId: string, userId?: string): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
      relations: ['seller', 'seller.faculty', 'seller.department', 'images', 'university', 'faculty', 'department', 'vendorProfile'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Check if user has favorited this listing
    let isFavorited = false;
    if (userId) {
      const favorite = await this.favoriteRepository.findOne({
        where: { userId, listingId },
      });
      isFavorited = !!favorite;
    }

    // Shop items: the vendor-shaped detail (options with soldOut flags,
    // fulfillment for the viewer's campus, service-area 404) — one URL for
    // every kind, the payload says what it is.
    if (listing.kind !== ListingKind.P2P) {
      const detail = await this.getVendorListingDetail(listing.id, userId);
      (detail as any).isFavorited = isFavorited;
      return detail as unknown as Listing;
    }

    if (userId) {
      (listing as any).isFavorited = isFavorited;
    }
    return this.sanitizeListingSeller(listing);
  }

  private async getVendorListingDetail(
    listingId: string,
    userId?: string,
  ): Promise<Record<string, unknown>> {
    const viewer = userId
      ? await this.userRepository.findOne({
        where: { id: userId },
        select: ['id', 'universityId'],
      })
      : null;
    if (!viewer) {
      // Browse is authenticated by design; a shop item needs the viewer's
      // campus to resolve fulfillment and the vendor's service area.
      throw new NotFoundException('Listing not found');
    }
    // Vendor detail counts its own view.
    return this.vendorMarketService.getListingDetail(viewer as User, listingId);
  }

  async getListingByIdAndIncrementViews(listingId: string, userId?: string): Promise<Listing> {
    const listing = await this.getListingById(listingId, userId);
    if ((listing as any).kind !== ListingKind.P2P) {
      return listing; // the vendor detail already counted the view
    }

    // Increment view count
    await this.listingRepository.increment({ id: listingId }, 'viewCount', 1);
    listing.viewCount += 1;

    return listing;
  }

  async searchListings(query: ListingQueryDto, currentUser?: User): Promise<PaginatedListingsResponseDto> {
    const qb = this.listingRepository
      .createQueryBuilder('listing')
      .leftJoinAndSelect('listing.seller', 'seller')
      .leftJoinAndSelect('seller.faculty', 'sellerFaculty')
      .leftJoinAndSelect('seller.department', 'sellerDepartment')
      .leftJoinAndSelect('listing.images', 'images')
      .leftJoinAndSelect('listing.university', 'university')
      .leftJoinAndSelect('listing.vendorProfile', 'vendorProfile');

    // Unified feed (one table, three kinds): a student sees
    //  - student listings under the P2P university / faculty / department rules
    //  - shop goods & services from any ACTIVE vendor whose service area
    //    covers their campus
    // An account without a university (vendor-only) falls back to
    // university-wide student listings only.
    if (currentUser?.universityId) {
      const viewer = currentUser;
      qb.andWhere(
        new Brackets((scope) => {
          scope.where(
            new Brackets((p2p) => {
              p2p.where('listing.kind = :p2pKind', { p2pKind: ListingKind.P2P });
              this.applyVisibilityFilter(p2p, viewer);
            }),
          );
          scope.orWhere(
            new Brackets((vendor) => {
              vendor
                .where('listing.kind <> :p2pKindV', { p2pKindV: ListingKind.P2P })
                .andWhere('vendorProfile.status = :vendorActive', {
                  vendorActive: VendorStatus.ACTIVE,
                })
                .andWhere(
                  'EXISTS (SELECT 1 FROM vendor_universities vu WHERE vu.vendor_profile_id = listing.vendor_profile_id AND vu.university_id = :viewerUniversityId)',
                  { viewerUniversityId: viewer.universityId },
                );
            }),
          );
        }),
      );
    } else {
      qb.andWhere('listing.kind = :p2pKindOnly', { p2pKindOnly: ListingKind.P2P });
      qb.andWhere('listing.visibilityScope = :scope', {
        scope: VisibilityScope.UNIVERSITY,
      });
    }

    // Apply status filter (default to active)
    qb.andWhere('listing.status = :status', {
      status: query.status || ListingStatus.ACTIVE,
    });

    // Search by text
    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('listing.title ILIKE :search', {
              search: `%${query.search}%`,
            })
            .orWhere('listing.description ILIKE :search', {
              search: `%${query.search}%`,
            });
        }),
      );
    }

    // Filter by category
    if (query.category) {
      qb.andWhere('listing.category = :category', {
        category: query.category,
      });
    } else if (query.categories && query.categories.length > 0) {
      qb.andWhere('listing.category IN (:...categories)', {
        categories: query.categories,
      });
    }

    // Filter by condition
    if (query.condition) {
      qb.andWhere('listing.condition = :condition', {
        condition: query.condition,
      });
    } else if (query.conditions && query.conditions.length > 0) {
      qb.andWhere('listing.condition IN (:...conditions)', {
        conditions: query.conditions,
      });
    }

    // Filter by kind (student items / shop goods / bookable services)
    if (query.kinds && query.kinds.length > 0) {
      qb.andWhere('listing.kind IN (:...kinds)', { kinds: query.kinds });
    }

    // Filter by price range
    if (query.minPrice !== undefined) {
      qb.andWhere('listing.price >= :minPrice', { minPrice: toKobo(query.minPrice) });
    }
    if (query.maxPrice !== undefined) {
      qb.andWhere('listing.price <= :maxPrice', { maxPrice: toKobo(query.maxPrice) });
    }

    // Filter by negotiable
    if (query.isNegotiable !== undefined) {
      qb.andWhere('listing.isNegotiable = :isNegotiable', {
        isNegotiable: query.isNegotiable,
      });
    }

    // Filter by university
    if (query.universityId) {
      qb.andWhere('listing.universityId = :universityId', {
        universityId: query.universityId,
      });
    }

    // Filter by faculty
    if (query.facultyId) {
      qb.andWhere('listing.facultyId = :facultyId', {
        facultyId: query.facultyId,
      });
    }

    // Filter by department
    if (query.departmentId) {
      qb.andWhere('listing.departmentId = :departmentId', {
        departmentId: query.departmentId,
      });
    }

    // Filter by seller
    if (query.sellerId) {
      qb.andWhere('listing.sellerId = :sellerId', {
        sellerId: query.sellerId,
      });
    }

    // Filter by verified sellers only: TIER_2 + high trust for students,
    // the CAC badge for shops.
    if (query.verifiedSellersOnly) {
      qb.andWhere(
        new Brackets((trusted) => {
          trusted
            .where(
              new Brackets((student) => {
                student
                  .where('listing.kind = :trustP2p', { trustP2p: ListingKind.P2P })
                  .andWhere('seller.completedTransactions >= :minTransactions', {
                    minTransactions: 10,
                  })
                  .andWhere('seller.sellerRating >= :minRating', { minRating: 4.5 })
                  .andWhere('seller.verificationTier = :verifiedTier', {
                    verifiedTier: 'tier_2',
                  });
              }),
            )
            .orWhere(
              new Brackets((shop) => {
                shop
                  .where('listing.kind <> :trustP2pV', { trustP2pV: ListingKind.P2P })
                  .andWhere('vendorProfile.isVerified = true');
              }),
            );
        }),
      );
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

    const listings = await qb.getMany();

    // Check favorites for authenticated user
    if (currentUser && listings.length > 0) {
      const listingIds = listings.map((l) => l.id);
      const favorites = await this.favoriteRepository.find({
        where: {
          userId: currentUser.id,
          listingId: In(listingIds),
        },
      });
      const favoriteSet = new Set(favorites.map((f) => f.listingId));
      listings.forEach((listing) => {
        (listing as any).isFavorited = favoriteSet.has(listing.id);
      });
    }

    // Public shape per kind (sanitized seller / business card + isSoldOut)
    const sanitizedListings = this.shapeListings(listings);

    const totalPages = Math.ceil(total / limit);

    return {
      listings: sanitizedListings,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  private applyVisibilityFilter(qb: WhereExpressionBuilder, user: User): void {
    qb.andWhere(
      new Brackets((subQb) => {
        // University-wide listings from same university
        subQb.where(
          new Brackets((uniQb) => {
            uniQb
              .where('listing.visibilityScope = :uniScope', {
                uniScope: VisibilityScope.UNIVERSITY,
              })
              .andWhere('listing.universityId = :userUniId', {
                userUniId: user.universityId,
              });
          }),
        );

        // Faculty-wide listings from same faculty
        if (user.facultyId) {
          subQb.orWhere(
            new Brackets((facQb) => {
              facQb
                .where('listing.visibilityScope = :facScope', {
                  facScope: VisibilityScope.FACULTY,
                })
                .andWhere('listing.facultyId = :userFacId', {
                  userFacId: user.facultyId,
                });
            }),
          );
        }

        // Department-wide listings from same department
        if (user.departmentId) {
          subQb.orWhere(
            new Brackets((deptQb) => {
              deptQb
                .where('listing.visibilityScope = :deptScope', {
                  deptScope: VisibilityScope.DEPARTMENT,
                })
                .andWhere('listing.departmentId = :userDeptId', {
                  userDeptId: user.departmentId,
                });
            }),
          );
        }

        // User's own listings regardless of scope
        subQb.orWhere('listing.sellerId = :userId', { userId: user.id });
      }),
    );
  }

  private applySorting(
    qb: SelectQueryBuilder<Listing>,
    sortBy?: ListingSortBy,
  ): void {
    switch (sortBy) {
      case ListingSortBy.PRICE_ASC:
        qb.orderBy('listing.price', 'ASC');
        break;
      case ListingSortBy.PRICE_DESC:
        qb.orderBy('listing.price', 'DESC');
        break;
      case ListingSortBy.VIEWS:
        qb.orderBy('listing.viewCount', 'DESC');
        break;
      case ListingSortBy.RELEVANCE:
        // For relevance, we'd need full-text search implementation
        // Fallback to created date
        qb.orderBy('listing.createdAt', 'DESC');
        break;
      case ListingSortBy.CREATED_AT:
      default:
        qb.orderBy('listing.createdAt', 'DESC');
        break;
    }

    // Secondary sort by id for consistent pagination
    qb.addOrderBy('listing.id', 'ASC');
  }

  async deleteListing(listingId: string, userId: string): Promise<void> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenException('You can only delete your own listings');
    }
    this.assertP2p(listing);

    // Soft delete by changing status
    await this.listingRepository.update(listingId, {
      status: ListingStatus.DELETED,
    });
  }

  async markAsSold(listingId: string, userId: string): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.sellerId !== userId) {
      throw new ForbiddenException('You can only update your own listings');
    }
    this.assertP2p(listing);

    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is not active');
    }

    await this.listingRepository.update(listingId, {
      status: ListingStatus.SOLD,
    });

    return this.getListingById(listingId, userId);
  }

  // Favorites functionality
  async addToFavorites(userId: string, listingId: string): Promise<void> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is not active');
    }

    const existingFavorite = await this.favoriteRepository.findOne({
      where: { userId, listingId },
    });

    if (existingFavorite) {
      return; // Already favorited
    }

    await this.favoriteRepository.save({
      userId,
      listingId,
    });

    // Increment favorite count on listing
    await this.listingRepository.increment(
      { id: listingId },
      'favoriteCount',
      1,
    );
  }

  async removeFromFavorites(userId: string, listingId: string): Promise<void> {
    const result = await this.favoriteRepository.delete({ userId, listingId });

    if (result.affected && result.affected > 0) {
      // Decrement favorite count on listing
      await this.listingRepository.decrement(
        { id: listingId },
        'favoriteCount',
        1,
      );
    }
  }

  async getUserFavorites(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedListingsResponseDto> {
    const offset = (page - 1) * limit;

    const [favorites, total] = await this.favoriteRepository.findAndCount({
      where: { userId },
      relations: ['listing', 'listing.seller', 'listing.seller.faculty', 'listing.seller.department', 'listing.images', 'listing.vendorProfile'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const listings = favorites.map((f) => {
      (f.listing as any).isFavorited = true;
      return f.listing;
    });

    // Public shape per kind (sanitized seller / business card + isSoldOut)
    const sanitizedListings = this.shapeListings(listings);

    const totalPages = Math.ceil(total / limit);

    return {
      listings: sanitizedListings,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async getUserListings(
    userId: string,
    status?: ListingStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedListingsResponseDto> {
    const offset = (page - 1) * limit;

    const whereClause: any = { sellerId: userId };
    if (status) {
      whereClause.status = status;
    } else {
      // Exclude deleted listings by default
      whereClause.status = In([
        ListingStatus.ACTIVE,
        ListingStatus.SOLD,
        ListingStatus.IN_ESCROW,
      ]);
    }

    const [listings, total] = await this.listingRepository.findAndCount({
      where: whereClause,
      relations: ['images', 'university'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      listings,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  // ─── Admin Methods ──────────────────────────────────────────────

  async adminListListings(dto: AdminListListingsDto): Promise<{ listings: Listing[]; total: number }> {
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);
    const sortOrder = dto.sortOrder || 'DESC';

    const qb = this.listingRepository.createQueryBuilder('l')
      .leftJoinAndSelect('l.seller', 'seller')
      .leftJoinAndSelect('l.images', 'images')
      .leftJoinAndSelect('l.university', 'university')
      // Shop rows: the admin table shows the business, not just the owner.
      .leftJoinAndSelect('l.vendorProfile', 'vendorProfile');

    if (dto.search) {
      qb.andWhere('(l.title ILIKE :search OR l.description ILIKE :search)', { search: `%${dto.search}%` });
    }
    if (dto.status) {
      qb.andWhere('l.status = :status', { status: dto.status });
    }
    if (dto.kind) {
      qb.andWhere('l.kind = :kind', { kind: dto.kind });
    }
    if (dto.category) {
      qb.andWhere('l.category = :category', { category: dto.category });
    }
    if (dto.universityId) {
      qb.andWhere('l.universityId = :universityId', { universityId: dto.universityId });
    }
    if (dto.sellerId) {
      qb.andWhere('l.sellerId = :sellerId', { sellerId: dto.sellerId });
    }
    if (dto.dateFrom) {
      qb.andWhere('l.createdAt >= :dateFrom', { dateFrom: dto.dateFrom });
    }
    if (dto.dateTo) {
      qb.andWhere('l.createdAt <= :dateTo', { dateTo: dto.dateTo });
    }
    if (dto.minPrice) {
      qb.andWhere('l.price >= :minPrice', { minPrice: toKobo(Number(dto.minPrice)) });
    }
    if (dto.maxPrice) {
      qb.andWhere('l.price <= :maxPrice', { maxPrice: toKobo(Number(dto.maxPrice)) });
    }

    qb.orderBy('l.createdAt', sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [listings, total] = await qb.getManyAndCount();

    return { listings: this.sanitizeListingsSellers(listings), total };
  }

  async adminTakedownListing(listingId: string): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
      relations: ['seller', 'images'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    listing.status = ListingStatus.DELETED;
    const saved = await this.listingRepository.save(listing);
    return this.sanitizeListingSeller(saved);
  }
}
