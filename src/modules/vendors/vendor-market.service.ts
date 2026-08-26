import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import {
  VendorListing,
  VendorListingStatus,
} from '../../database/entities/vendor-listing.entity';
import { User } from '../../database/entities/user.entity';
import { requireUniversityId } from '../../common/utils/student-identity';
import { isListingSoldOut } from './vendor-listing.util';
import {
  BrowseVendorsDto,
  SearchVendorListingsDto,
} from './dto/vendor-market-query.dto';

/**
 * The buyer read plane for the vendors' market (rev-2 spec 03.8), scoped by
 * service area: a vendor's storefront and items are visible at exactly the
 * universities the vendor serves. Browsing is category-first (vendors →
 * storefront); search is item-level ("I want jollof rice right now").
 * Ratings reuse the existing per-user review aggregate (spec 01.4).
 */
@Injectable()
export class VendorMarketService {
  constructor(
    @InjectRepository(VendorProfile)
    private profileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    @InjectRepository(VendorListing)
    private listingRepo: Repository<VendorListing>,
  ) { }

  /** Category-first vendor browse — only vendors with something to sell here. */
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
        `EXISTS (SELECT 1 FROM vendor_listings vl WHERE vl.vendor_profile_id = p.id AND vl.status = 'active'` +
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
        status: VendorListingStatus.ACTIVE,
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
      .where('vl.status = :listingActive', {
        listingActive: VendorListingStatus.ACTIVE,
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
        vendor: this.toVendorSummary(listing.vendorProfile),
      })),
      total,
      page,
      limit,
    };
  }

  /** Full listing detail, with fulfillment resolved for the buyer's campus. */
  async getListingDetail(
    user: User,
    listingId: string,
  ): Promise<Record<string, unknown>> {
    const universityId = requireUniversityId(user);
    const listing = await this.listingRepo.findOne({
      where: { id: listingId },
      relations: [
        'vendorProfile',
        'vendorProfile.user',
        'images',
        'optionGroups',
        'optionGroups.options',
        'fulfillment',
      ],
    });
    if (
      !listing ||
      listing.status !== VendorListingStatus.ACTIVE ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE ||
      !(await this.serves(listing.vendorProfileId, universityId))
    ) {
      throw new NotFoundException('Listing not found');
    }

    // Fire-and-forget view counter (parity with the P2P listing detail).
    void this.listingRepo.increment({ id: listing.id }, 'viewCount', 1);

    const fulfillmentRow = (listing.fulfillment ?? []).find(
      (row) => row.universityId === universityId,
    );

    return {
      ...this.toBuyerListingSummary(listing),
      vendor: this.toVendorSummary(listing.vendorProfile),
      // Pickup at the shop is always available at served universities (03.2).
      fulfillment: {
        pickupAvailable: true,
        deliveryEnabled: fulfillmentRow?.deliveryEnabled ?? false,
        deliveryFee:
          fulfillmentRow?.deliveryEnabled && fulfillmentRow.deliveryFee !== null
            ? Number(fulfillmentRow.deliveryFee)
            : null,
      },
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

  private toVendorSummary(profile: VendorProfile): Record<string, unknown> {
    return {
      id: profile.id,
      businessName: profile.businessName,
      isVerified: profile.isVerified,
      homeUniversityId: profile.homeUniversityId,
      rating: profile.user ? Number(profile.user.sellerRating) : null,
      ratingCount: profile.user ? profile.user.sellerRatingCount : null,
    };
  }

  /** Buyer view: per-option soldOut flags, never raw stock figures. */
  private toBuyerListingSummary(
    listing: VendorListing,
  ): Record<string, unknown> {
    return {
      id: listing.id,
      type: listing.type,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      basePrice: Number(listing.basePrice),
      manualConfirm: listing.manualConfirm,
      isSoldOut: isListingSoldOut(listing),
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
