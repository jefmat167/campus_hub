import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, Between, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import {
  HousingListing,
  HousingStatus,
} from '../../database/entities/housing.entity';
import { User } from '../../database/entities/user.entity';
import { CreateHousingDto, SearchHousingDto } from './dto';

@Injectable()
export class HousingService {
  private readonly logger = new Logger(HousingService.name);

  constructor(
    @InjectRepository(HousingListing)
    private housingRepo: Repository<HousingListing>,
  ) {}

  /**
   * Sanitize landlord object to remove sensitive data
   */
  private sanitizeLandlord(landlord: User): Record<string, any> {
    if (!landlord) return landlord;

    return {
      id: landlord.id,
      fullName: landlord.fullName,
      email: landlord.email,
      phone: landlord.phone,
      profilePhotoUrl: landlord.profilePhotoUrl,
      verificationTier: landlord.verificationTier,
    };
  }

  /**
   * Sanitize landlord in a housing listing
   */
  private sanitizeListingLandlord(listing: HousingListing): HousingListing {
    if (listing.landlord) {
      (listing as any).landlord = this.sanitizeLandlord(listing.landlord);
    }
    return listing;
  }

  /**
   * Sanitize landlords in an array of listings
   */
  private sanitizeListingsLandlords(listings: HousingListing[]): HousingListing[] {
    return listings.map((listing) => this.sanitizeListingLandlord(listing));
  }

  /**
   * Create a new housing listing
   */
  async createListing(
    landlordId: string,
    universityId: string,
    dto: CreateHousingDto,
  ): Promise<HousingListing> {
    const listing = this.housingRepo.create({
      landlordId,
      universityId,
      ...dto,
      availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
    });

    const saved = await this.housingRepo.save(listing);
    this.logger.log(`Housing listing ${saved.id} created by user ${landlordId}`);

    return saved;
  }

  /**
   * Update a housing listing
   */
  async updateListing(
    listingId: string,
    landlordId: string,
    dto: Partial<CreateHousingDto>,
  ): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.landlordId !== landlordId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    Object.assign(listing, dto);

    if (dto.availableFrom) {
      listing.availableFrom = new Date(dto.availableFrom);
    }

    return this.housingRepo.save(listing);
  }

  /**
   * Get a housing listing by ID
   */
  async getListing(listingId: string): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({
      where: { id: listingId, status: HousingStatus.AVAILABLE },
      relations: ['landlord', 'university'],
    });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    // Increment view count
    await this.housingRepo.increment({ id: listingId }, 'viewCount', 1);

    return this.sanitizeListingLandlord(listing);
  }

  /**
   * Search housing listings
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
      isVerified,
      page = 1,
      limit = 20,
      sortBy = 'newest',
    } = dto;

    const queryBuilder = this.housingRepo
      .createQueryBuilder('housing')
      .leftJoinAndSelect('housing.landlord', 'landlord')
      .where('housing.universityId = :universityId', { universityId })
      .andWhere('housing.status = :status', { status: HousingStatus.AVAILABLE });

    // Text search
    if (search) {
      queryBuilder.andWhere(
        '(housing.title ILIKE :search OR housing.description ILIKE :search OR housing.area ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    // Type filter
    if (type) {
      queryBuilder.andWhere('housing.type = :type', { type });
    }

    // Price range filter
    if (minPrice !== undefined) {
      queryBuilder.andWhere('housing.pricePerMonth >= :minPrice', { minPrice });
    }
    if (maxPrice !== undefined) {
      queryBuilder.andWhere('housing.pricePerMonth <= :maxPrice', { maxPrice });
    }

    // Area filter
    if (area) {
      queryBuilder.andWhere('housing.area ILIKE :area', { area: `%${area}%` });
    }

    // Bedrooms filter
    if (bedrooms !== undefined) {
      queryBuilder.andWhere('housing.bedrooms >= :bedrooms', { bedrooms });
    }

    // Bathrooms filter
    if (bathrooms !== undefined) {
      queryBuilder.andWhere('housing.bathrooms >= :bathrooms', { bathrooms });
    }

    // Furnishing filter
    if (furnishing) {
      queryBuilder.andWhere('housing.furnishing = :furnishing', { furnishing });
    }

    // Gender preference filter
    if (genderPreference) {
      queryBuilder.andWhere('housing.genderPreference = :genderPreference', {
        genderPreference,
      });
    }

    // Amenity filters
    if (hasWater) {
      queryBuilder.andWhere('housing.hasWater = true');
    }
    if (hasElectricity) {
      queryBuilder.andWhere('housing.hasElectricity = true');
    }
    if (hasInternet) {
      queryBuilder.andWhere('housing.hasInternet = true');
    }
    if (hasGenerator) {
      queryBuilder.andWhere('housing.hasGenerator = true');
    }

    // Verified filter
    if (isVerified) {
      queryBuilder.andWhere('housing.isVerified = true');
    }

    // Sorting
    switch (sortBy) {
      case 'price_asc':
        queryBuilder.orderBy('housing.pricePerMonth', 'ASC');
        break;
      case 'price_desc':
        queryBuilder.orderBy('housing.pricePerMonth', 'DESC');
        break;
      case 'popular':
        queryBuilder.orderBy('housing.viewCount', 'DESC');
        break;
      case 'newest':
      default:
        queryBuilder.orderBy('housing.createdAt', 'DESC');
    }

    // Pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    const [listings, total] = await queryBuilder.getManyAndCount();

    return { listings: this.sanitizeListingsLandlords(listings), total };
  }

  /**
   * Get user's own listings
   */
  async getMyListings(
    landlordId: string,
    page = 1,
    limit = 20,
  ): Promise<{ listings: HousingListing[]; total: number }> {
    const [listings, total] = await this.housingRepo.findAndCount({
      where: { landlordId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { listings, total };
  }

  /**
   * Update listing status
   */
  async updateStatus(
    listingId: string,
    landlordId: string,
    status: HousingStatus,
  ): Promise<HousingListing> {
    const listing = await this.housingRepo.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.landlordId !== landlordId) {
      throw new ForbiddenException('You can only update your own listings');
    }

    listing.status = status;

    return this.housingRepo.save(listing);
  }

  /**
   * Delete listing (soft delete)
   */
  async deleteListing(listingId: string, landlordId: string): Promise<void> {
    const listing = await this.housingRepo.findOne({
      where: { id: listingId },
    });

    if (!listing) {
      throw new NotFoundException('Housing listing not found');
    }

    if (listing.landlordId !== landlordId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    listing.status = HousingStatus.DELETED;

    await this.housingRepo.save(listing);
    this.logger.log(`Housing listing ${listingId} deleted by user ${landlordId}`);
  }

  /**
   * Increment inquiry count
   */
  async incrementInquiry(listingId: string): Promise<void> {
    await this.housingRepo.increment({ id: listingId }, 'inquiryCount', 1);
  }
}
