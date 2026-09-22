import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import {
  Listing,
  ListingKind,
  ListingStatus,
  VENDOR_LISTING_KINDS,
} from '../../database/entities/listing.entity';
import { User } from '../../database/entities/user.entity';
import { requireUniversityId } from '../../common/utils/student-identity';
import { isListingSoldOut } from './vendor-listing.util';
import {
  CampusDeliveryPreset,
  VendorDeliveryService,
} from './vendor-delivery.service';
import {
  BrowseVendorsDto,
  SearchVendorListingsDto,
} from './dto/vendor-market-query.dto';

/**
 * The buyer read plane for VENDOR listings (rev-2 spec 03.8), scoped by
 * service area: a vendor's storefront and items are visible at exactly the
 * universities the vendor serves. Since the unified marketplace, the student
 * feed itself lives in `MarketplaceService.searchListings`; this service keeps
 * the storefront, the vendor directory, and the vendor-shaped detail
 * (options with soldOut flags, fulfillment for the buyer's campus) that the
 * unified detail endpoint delegates to.
 */
@Injectable()
export class VendorMarketService {
  constructor(
    @InjectRepository(VendorProfile)
    private profileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    private vendorDelivery: VendorDeliveryService,
  ) { }

  /** Vendor directory — only vendors with something to sell here. */
  async browseVendors(
    user: User,
    dto: BrowseVendorsDto,
  ): Promise<{ vendors: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const universityId = requireUniversityId(user);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    const qb = this.profileRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'vendorUser')
      .where('p.status = :active', { active: VendorStatus.ACTIVE })
      .andWhere(
        'EXISTS (SELECT 1 FROM vendor_universities vu WHERE vu.vendor_profile_id = p.id AND vu.university_id = :universityId)',
        { universityId },
      )
      .andWhere(
        `EXISTS (SELECT 1 FROM listings vl WHERE vl.vendor_profile_id = p.id AND vl.kind <> 'p2p' AND vl.status = 'active'` +
        (dto.category ? ' AND vl.category = :category)' : ')'),
        dto.category ? { category: dto.category } : {},
      );

    if (dto.search) {
      qb.andWhere('p.business_name ILIKE :search', {
        search: `%${dto.search}%`,
      });
    }

    const [profiles, total] = await qb
      .orderBy('p.businessName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      vendors: profiles.map((profile) => this.toVendorSummary(profile)),
      total,
      page,
      limit,
    };
  }

  /** A vendor's storefront: public profile + rating + active listings. */
  async getStorefront(
    user: User,
    profileId: string,
  ): Promise<Record<string, unknown>> {
    const universityId = requireUniversityId(user);
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
      relations: ['user', 'homeUniversity'],
    });
    if (
      !profile ||
      profile.status !== VendorStatus.ACTIVE ||
      !(await this.serves(profile.id, universityId))
    ) {
      throw new NotFoundException('Vendor not found');
    }

    const listings = await this.listingRepo.find({
      where: {
        vendorProfileId: profile.id,
        kind: In([...VENDOR_LISTING_KINDS]),
        status: ListingStatus.ACTIVE,
      },
      relations: ['images', 'optionGroups', 'optionGroups.options'],
      order: { createdAt: 'DESC' },
    });

    return {
      vendor: {
        ...this.toVendorSummary(profile),
        description: profile.description,
        homeUniversity: profile.homeUniversity
          ? {
            id: profile.homeUniversity.id,
            name: profile.homeUniversity.name,
            code: profile.homeUniversity.code,
          }
          : undefined,
      },
      listings: listings.map((listing) => this.toBuyerListingSummary(listing)),
    };
  }

  /** Item-level search across every vendor serving the buyer's university. */
  async searchListings(
    user: User,
    dto: SearchVendorListingsDto,
  ): Promise<{ listings: Record<string, unknown>[]; total: number; page: number; limit: number }> {
    const universityId = requireUniversityId(user);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    const qb = this.listingRepo
      .createQueryBuilder('vl')
      .innerJoinAndSelect('vl.vendorProfile', 'p', 'p.status = :active', {
        active: VendorStatus.ACTIVE,
      })
      // Needed for the rating on each result's vendor summary (spec 03.8).
      .leftJoinAndSelect('p.user', 'vendorUser')
      .leftJoinAndSelect('vl.images', 'images')
      .leftJoinAndSelect('vl.optionGroups', 'groups')
      .leftJoinAndSelect('groups.options', 'options')
      .where('vl.kind IN (:...kinds)', { kinds: [...VENDOR_LISTING_KINDS] })
      .andWhere('vl.status = :listingActive', {
        listingActive: ListingStatus.ACTIVE,
      })
      .andWhere(
        'EXISTS (SELECT 1 FROM vendor_universities vu WHERE vu.vendor_profile_id = p.id AND vu.university_id = :universityId)',
        { universityId },
      );

    if (dto.q) {
      qb.andWhere('(vl.title ILIKE :q OR vl.description ILIKE :q)', {
        q: `%${dto.q}%`,
      });
    }
    if (dto.category) {
      qb.andWhere('vl.category = :category', { category: dto.category });
    }

    const [listings, total] = await qb
      .orderBy('vl.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      listings: listings.map((listing) => ({
        ...this.toBuyerListingSummary(listing),
        vendor: this.toVendorSummary(listing.vendorProfile as VendorProfile),
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Full listing detail, with the vendor's delivery preset resolved for the
   * buyer's campus (2026-09-21 amendment: delivery is vendor-level; the
   * listing only opts out via `pickupOnly`).
   */
  async getListingDetail(
    user: User,
    listingId: string,
    options: { countView?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    const universityId = requireUniversityId(user);
    const listing = await this.listingRepo.findOne({
      where: { id: listingId, kind: In([...VENDOR_LISTING_KINDS]) },
      relations: [
        'vendorProfile',
        'vendorProfile.user',
        'images',
        'optionGroups',
        'optionGroups.options',
      ],
    });
    if (
      !listing ||
      listing.status !== ListingStatus.ACTIVE ||
      !listing.vendorProfile ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      throw new NotFoundException('Listing not found');
    }
    // Service-area gate + the preset in one query (null = not served here).
    const preset = await this.vendorDelivery.resolveForCampus(
      listing.vendorProfileId as string,
      universityId,
    );
    if (!preset) {
      throw new NotFoundException('Listing not found');
    }

    // Fire-and-forget view counter (parity with the P2P listing detail).
    if (options.countView ?? true) {
      void this.listingRepo.increment({ id: listing.id }, 'viewCount', 1);
    }

    return {
      ...this.toBuyerListingSummary(listing),
      vendor: this.toVendorSummary(listing.vendorProfile),
      fulfillment: VendorMarketService.toFulfillmentView(listing, preset),
    };
  }

  /**
   * A vendor's delivery preset as it applies to the caller's campus — what
   * the checkout screen needs once per vendor (instead of once per listing).
   * 404 when the vendor isn't ACTIVE or doesn't serve the caller's campus.
   */
  async getVendorDelivery(
    user: User,
    profileId: string,
  ): Promise<CampusDeliveryPreset> {
    const universityId = requireUniversityId(user);
    const preset = await this.vendorDelivery.resolveForCampus(
      profileId,
      universityId,
    );
    if (!preset) {
      throw new NotFoundException('Vendor not found');
    }
    return preset;
  }

  /**
   * How ONE listing can reach a buyer on the preset's campus. Pickup at the
   * shop is always available at served universities (03.2). `delivery` is
   * null for services and for pickup-only goods; goods with no door delivery
   * and no drop points come back as `{ doorDelivery: null, dropPoints: [] }`
   * (= not deliverable). `travel` is null for goods and at-shop-only services.
   */
  static toFulfillmentView(
    listing: Pick<Listing, 'kind' | 'pickupOnly'>,
    preset: CampusDeliveryPreset,
  ): Record<string, unknown> {
    const pickupOnly = !!listing.pickupOnly;
    return {
      pickupAvailable: true,
      pickupOnly,
      delivery:
        listing.kind === ListingKind.VENDOR_GOODS && !pickupOnly
          ? {
            doorDelivery:
              preset.doorDeliveryFee !== null
                ? { fee: preset.doorDeliveryFee }
                : null,
            dropPoints: preset.dropPoints,
          }
          : null,
      travel:
        listing.kind === ListingKind.VENDOR_SERVICE &&
          !pickupOnly &&
          preset.serviceTravelFee !== null
          ? { fee: preset.serviceTravelFee }
          : null,
    };
  }

  // ─── internals ───

  private async serves(
    vendorProfileId: string,
    universityId: string,
  ): Promise<boolean> {
    const row = await this.vendorUniversityRepo.findOne({
      where: { vendorProfileId, universityId },
    });
    return !!row;
  }

  toVendorSummary(profile: VendorProfile): Record<string, unknown> {
    return {
      id: profile.id,
      businessName: profile.businessName,
      isVerified: profile.isVerified,
      homeUniversityId: profile.homeUniversityId,
      shopfrontPhotoUrl: profile.shopfrontPhotoUrl ?? null,
      rating: profile.user ? Number(profile.user.sellerRating) : null,
      ratingCount: profile.user ? profile.user.sellerRatingCount : null,
    };
  }

  /** Buyer view: per-option soldOut flags, never raw stock figures. */
  toBuyerListingSummary(listing: Listing): Record<string, unknown> {
    return {
      id: listing.id,
      kind: listing.kind,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      price: Number(listing.price),
      manualConfirm: listing.manualConfirm,
      pickupOnly: !!listing.pickupOnly,
      isSoldOut: isListingSoldOut(listing),
      viewCount: listing.viewCount,
      favoriteCount: listing.favoriteCount,
      createdAt: listing.createdAt,
      images: (listing.images ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((image) => image.url),
      optionGroups: (listing.optionGroups ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((group) => ({
          id: group.id,
          name: group.name,
          selectionType: group.selectionType,
          required: group.required,
          options: (group.options ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((option) => ({
              id: option.id,
              name: option.name,
              priceDelta: Number(option.priceDelta),
              soldOut: option.stock !== null && option.stock <= 0,
            })),
        })),
    };
  }
}
