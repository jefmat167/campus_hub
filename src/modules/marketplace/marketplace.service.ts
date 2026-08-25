import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, In, Brackets } from 'typeorm';
import { toKobo } from '../../common/utils/money';
import {
  Listing,
  ListingImage,
  ListingStatus,
  VisibilityScope,
  DeliveryMethod,
} from '../../database/entities/listing.entity';
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

    // Delivery config must be coherent (>=1 method + matching addresses).
    this.validateDeliveryConfig(
      dto.deliveryMethods,
      dto.pickupAddress,
      dto.meetupPoints,
    );

    // Reject before creating anything if an uploaded image's real size differs
    // from what was declared when its presigned URL was issued.
    if (dto.imageUrls && dto.imageUrls.length > 0) {
      await this.uploadService.verifyUploadedFileSizes(dto.imageUrls);
    }

    // Create the listing
    // Only set facultyId/departmentId if explicitly provided in the DTO
    const listing = this.listingRepository.create({
      ...dto,
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

    // If any delivery field is changing, re-validate the resulting config.
    if (
      dto.deliveryMethods !== undefined ||
      dto.pickupAddress !== undefined ||
      dto.meetupPoints !== undefined
    ) {
      this.validateDeliveryConfig(
        dto.deliveryMethods ?? listing.deliveryMethods,
        dto.pickupAddress !== undefined ? dto.pickupAddress : listing.pickupAddress,
        dto.meetupPoints !== undefined ? dto.meetupPoints : listing.meetupPoints,
      );
    }

    // Remove imageUrls from dto before updating listing
    const { imageUrls, ...updateData } = dto;

    await this.listingRepository.update(listingId, updateData);

    return this.getListingById(listingId, userId);
  }

  /**
   * Validate a listing's delivery config: at least one method, and each offered
   * method has its required address(es). Used on create and update.
   */
  private validateDeliveryConfig(
    methods: DeliveryMethod[] | undefined,
    pickupAddress: string | null | undefined,
    meetupPoints: string[] | null | undefined,
  ): void {
    if (!methods || methods.length === 0) {
      throw new BadRequestException('At least one delivery method is required');
    }
    if (methods.includes(DeliveryMethod.PICKUP) && !pickupAddress?.trim()) {
      throw new BadRequestException(
        'A pickup address is required when "pickup" is offered',
      );
    }
    if (
      methods.includes(DeliveryMethod.MEETUP) &&
      (meetupPoints ?? []).filter((p) => p?.trim()).length === 0
    ) {
      throw new BadRequestException(
        'At least one meet-up point is required when "meetup" is offered',
      );
    }
  }

  async getListingById(listingId: string, userId?: string): Promise<Listing> {
    const listing = await this.listingRepository.findOne({
      where: { id: listingId },
      relations: ['seller', 'seller.faculty', 'seller.department', 'images', 'university', 'faculty', 'department'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    // Check if user has favorited this listing
    if (userId) {
      const favorite = await this.favoriteRepository.findOne({
        where: { userId, listingId },
      });
      (listing as any).isFavorited = !!favorite;
    }

    return this.sanitizeListingSeller(listing);
  }

  async getListingByIdAndIncrementViews(listingId: string, userId?: string): Promise<Listing> {
    const listing = await this.getListingById(listingId, userId);

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
      .leftJoinAndSelect('listing.university', 'university');

    // Apply visibility scope filtering based on current user (an account
    // without a university — vendor-only — falls back to the anonymous view)
    if (currentUser?.universityId) {
      this.applyVisibilityFilter(qb, currentUser);
    } else {
      // Only show university-wide listings for non-authenticated users
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

    // Filter by type
    if (query.type) {
      qb.andWhere('listing.type = :type', { type: query.type });
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

    // Filter by verified sellers only (TIER_2 + high trust)
    if (query.verifiedSellersOnly) {
      qb.andWhere('seller.completedTransactions >= :minTransactions', {
        minTransactions: 10,
      })
        .andWhere('seller.sellerRating >= :minRating', {
          minRating: 4.5,
        })
        .andWhere('seller.verificationTier = :verifiedTier', {
          verifiedTier: 'tier_2',
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

    // Sanitize seller data in all listings
    const sanitizedListings = this.sanitizeListingsSellers(listings);

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

  private applyVisibilityFilter(qb: SelectQueryBuilder<Listing>, user: User): void {
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
      relations: ['listing', 'listing.seller', 'listing.seller.faculty', 'listing.seller.department', 'listing.images'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const listings = favorites.map((f) => {
      (f.listing as any).isFavorited = true;
      return f.listing;
    });

    // Sanitize seller data in all listings
    const sanitizedListings = this.sanitizeListingsSellers(listings);

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
      .leftJoinAndSelect('l.university', 'university');

    if (dto.search) {
      qb.andWhere('(l.title ILIKE :search OR l.description ILIKE :search)', { search: `%${dto.search}%` });
    }
    if (dto.status) {
      qb.andWhere('l.status = :status', { status: dto.status });
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
