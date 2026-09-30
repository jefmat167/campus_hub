import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import {
  Listing,
  ListingImage,
  ListingKind,
  ListingStatus,
  VENDOR_LISTING_KINDS,
  VisibilityScope,
} from '../../database/entities/listing.entity';
import {
  VendorOption,
  VendorOptionGroup,
} from '../../database/entities/vendor-option.entity';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { UploadService } from '../upload/upload.service';
import { isListingSoldOut } from './vendor-listing.util';
import {
  AdjustStockDto,
  CreateVendorListingDto,
  ReplaceOptionGroupsDto,
  UpdateVendorListingDto,
  VendorOptionGroupInputDto,
} from './dto/vendor-listing-input.dto';

const MAX_IMAGES = 5;

/**
 * The vendor write plane for the catalog (rev-2 spec 03.3 / 03.5) on the ONE
 * listings table (unified marketplace): goods & services with option groups
 * and per-option stock. Delivery is NOT configured here any more (2026-09-21
 * amendment): it is the vendor's per-campus preset (`VendorDeliveryService`),
 * inherited by every listing — a listing only opts out via `pickupOnly`.
 * Confirmation rule (decision log #8): services and untracked-stock goods are
 * always manual-confirm; auto-confirmation requires tracked stock.
 */
@Injectable()
export class VendorCatalogService {
  private readonly logger = new Logger(VendorCatalogService.name);

  constructor(
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    @InjectRepository(ListingImage)
    private imageRepo: Repository<ListingImage>,
    @InjectRepository(VendorOptionGroup)
    private groupRepo: Repository<VendorOptionGroup>,
    private dataSource: DataSource,
    private uploadService: UploadService,
  ) { }

  async createListing(
    profile: VendorProfile,
    dto: CreateVendorListingDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);

    const isService = dto.kind === ListingKind.VENDOR_SERVICE;
    if (isService && dto.stock !== undefined) {
      throw new BadRequestException(
        'Services carry no stock — there is nothing to count (rev-2 03.3)',
      );
    }
    this.assertNoServiceOptionStock(dto.kind, dto.optionGroups ?? []);
    const stock = isService ? null : dto.stock ?? null;
    const manualConfirm = this.resolveManualConfirm(
      dto.kind,
      stock,
      dto.manualConfirm,
    );

    if (dto.imageUrls && dto.imageUrls.length > 0) {
      await this.uploadService.verifyUploadedFileSizes(dto.imageUrls);
    }

    const listingId = await this.dataSource.transaction(async (manager) => {
      const listing = await manager.save(
        manager.create(Listing, {
          kind: dto.kind,
          // The vendor's one account is the seller; the business identity,
          // service area and verification stay on the profile.
          sellerId: profile.userId,
          vendorProfileId: profile.id,
          universityId: profile.homeUniversityId,
          visibilityScope: VisibilityScope.UNIVERSITY,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          price: dto.price,
          condition: null,
          isNegotiable: false,
          meetupPoints: null,
          stock,
          manualConfirm,
          pickupOnly: dto.pickupOnly ?? false,
          status: ListingStatus.ACTIVE,
        }),
      );

      for (const [index, url] of (dto.imageUrls ?? []).entries()) {
        await manager.save(
          manager.create(ListingImage, {
            listingId: listing.id,
            url,
            position: index,
          }),
        );
      }

      await this.insertOptionGroups(manager, listing.id, dto.optionGroups ?? []);

      return listing.id;
    });

    this.logger.log(`Vendor ${profile.id} created listing ${listingId}`);
    return this.getOwnListing(profile, listingId);
  }

  async listOwn(
    profile: VendorProfile,
    status?: ListingStatus,
  ): Promise<Record<string, unknown>[]> {
    const listings = await this.listingRepo.find({
      where: {
        vendorProfileId: profile.id,
        kind: In([...VENDOR_LISTING_KINDS]),
        status: status ?? Not(ListingStatus.DELETED),
      },
      relations: ['images', 'optionGroups', 'optionGroups.options'],
      order: { createdAt: 'DESC' },
    });
    return listings.map((listing) => this.toOwnView(listing));
  }

  async getOwnListing(
    profile: VendorProfile,
    listingId: string,
  ): Promise<Record<string, unknown>> {
    const listing = await this.findOwn(profile, listingId, true);
    return this.toOwnView(listing);
  }

  async updateListing(
    profile: VendorProfile,
    listingId: string,
    dto: UpdateVendorListingDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);
    const listing = await this.findOwn(profile, listingId, false);

    if (dto.stock !== undefined && listing.kind === ListingKind.VENDOR_SERVICE) {
      throw new BadRequestException('Services carry no stock');
    }

    if (dto.title !== undefined) listing.title = dto.title;
    if (dto.description !== undefined) listing.description = dto.description;
    if (dto.category !== undefined) listing.category = dto.category;
    if (dto.price !== undefined) listing.price = dto.price;
    if (dto.status !== undefined) listing.status = dto.status;
    if (dto.stock !== undefined) listing.stock = dto.stock;
    if (dto.pickupOnly !== undefined) listing.pickupOnly = dto.pickupOnly;

    // Re-derive the confirmation rule against the (possibly new) stock. An
    // EXPLICIT manualConfirm=false with untracked stock is a 400; an inherited
    // false is silently forced back to manual when stock stops being tracked.
    if (dto.manualConfirm !== undefined) {
      listing.manualConfirm = this.resolveManualConfirm(
        listing.kind,
        listing.stock,
        dto.manualConfirm,
      );
    } else if (listing.stock === null && !listing.manualConfirm) {
      listing.manualConfirm = true;
    }

    if (dto.imageUrls && dto.imageUrls.length > 0) {
      await this.uploadService.verifyUploadedFileSizes(dto.imageUrls);
      const existing = await this.imageRepo.count({
        where: { listingId: listing.id },
      });
      if (existing + dto.imageUrls.length > MAX_IMAGES) {
        throw new BadRequestException(
          `A listing can carry at most ${MAX_IMAGES} images`,
        );
      }
      for (const [index, url] of dto.imageUrls.entries()) {
        await this.imageRepo.save(
          this.imageRepo.create({
            listingId: listing.id,
            url,
            position: existing + index,
          }),
        );
      }
    }

    await this.listingRepo.save(listing);
    return this.getOwnListing(profile, listingId);
  }

  async deleteListing(
    profile: VendorProfile,
    listingId: string,
  ): Promise<{ deleted: true }> {
    this.assertActive(profile);
    const listing = await this.findOwn(profile, listingId, false);
    listing.status = ListingStatus.DELETED;
    await this.listingRepo.save(listing);
    return { deleted: true };
  }

  /** Full replacement of the option-group set (order lines keep snapshots). */
  async replaceOptionGroups(
    profile: VendorProfile,
    listingId: string,
    dto: ReplaceOptionGroupsDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);
    const listing = await this.findOwn(profile, listingId, false);
    this.assertNoServiceOptionStock(listing.kind, dto.groups);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(VendorOptionGroup, { listingId });
      await this.insertOptionGroups(manager, listingId, dto.groups);
    });

    return this.getOwnListing(profile, listingId);
  }

  async adjustBaseStock(
    profile: VendorProfile,
    listingId: string,
    dto: AdjustStockDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);
    const listing = await this.findOwn(profile, listingId, false);
    if (listing.kind === ListingKind.VENDOR_SERVICE) {
      throw new BadRequestException('Services carry no stock');
    }
    listing.stock = dto.stock;
    if (dto.stock === null && !listing.manualConfirm) {
      listing.manualConfirm = true; // untracked stock forces manual confirm
    }
    await this.listingRepo.save(listing);
    return this.getOwnListing(profile, listingId);
  }

  async adjustOptionStock(
    profile: VendorProfile,
    listingId: string,
    optionId: string,
    dto: AdjustStockDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);
    const listing = await this.findOwn(profile, listingId, false);
    if (listing.kind === ListingKind.VENDOR_SERVICE) {
      throw new BadRequestException('Services carry no stock');
    }

    const group = await this.groupRepo
      .createQueryBuilder('g')
      .innerJoinAndSelect('g.options', 'o', 'o.id = :optionId', { optionId })
      .where('g.listingId = :listingId', { listingId })
      .getOne();
    const option = group?.options?.[0];
    if (!option) {
      throw new NotFoundException('Option not found on this listing');
    }

    option.stock = dto.stock;
    await this.dataSource.getRepository(VendorOption).save(option);
    return this.getOwnListing(profile, listingId);
  }

  // ─── internals ───

  private assertActive(profile: VendorProfile): void {
    if (profile.status !== VendorStatus.ACTIVE) {
      throw new ForbiddenException({
        message: 'Your storefront is not active',
        vendorStatus: profile.status,
      });
    }
  }

  /**
   * Services carry no stock at ANY level — base or per option (rev-2 03.3).
   * Mirrors the base-stock rule, so an explicit `stock: null` is rejected too.
   */
  private assertNoServiceOptionStock(
    kind: ListingKind,
    groups: VendorOptionGroupInputDto[],
  ): void {
    if (kind !== ListingKind.VENDOR_SERVICE) return;
    const hasOptionStock = groups.some((g) =>
      g.options.some((o) => o.stock !== undefined),
    );
    if (hasOptionStock) {
      throw new BadRequestException(
        'Services carry no stock — remove stock from the service options',
      );
    }
  }

  /** Confirmation rule (rev-2 03.5 + decision log #8). */
  private resolveManualConfirm(
    kind: ListingKind,
    stock: number | null,
    requested?: boolean,
  ): boolean {
    if (kind === ListingKind.VENDOR_SERVICE) {
      if (requested === false) {
        throw new BadRequestException(
          'Services always require manual confirmation — there is no stock signal to trust',
        );
      }
      return true;
    }
    if (stock === null || stock === undefined) {
      if (requested === false) {
        throw new BadRequestException(
          'Auto-confirmation requires tracked stock — set a stock quantity first',
        );
      }
      return true;
    }
    return requested ?? false;
  }

  private async insertOptionGroups(
    manager: EntityManager,
    listingId: string,
    groups: VendorOptionGroupInputDto[],
  ): Promise<void> {
    for (const [groupIndex, groupInput] of groups.entries()) {
      const group = await manager.save(
        manager.create(VendorOptionGroup, {
          listingId,
          name: groupInput.name,
          selectionType: groupInput.selectionType,
          required: groupInput.required,
          position: groupIndex,
        }),
      );
      for (const [optionIndex, optionInput] of groupInput.options.entries()) {
        await manager.save(
          manager.create(VendorOption, {
            optionGroupId: group.id,
            name: optionInput.name,
            priceDelta: optionInput.priceDelta ?? 0,
            stock: optionInput.stock ?? null,
            position: optionIndex,
          }),
        );
      }
    }
  }

  private async findOwn(
    profile: VendorProfile,
    listingId: string,
    withRelations: boolean,
  ): Promise<Listing> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId, vendorProfileId: profile.id },
      relations: withRelations
        ? ['images', 'optionGroups', 'optionGroups.options']
        : [],
    });
    if (!listing || listing.status === ListingStatus.DELETED) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  /** Vendor-plane view: includes raw stock figures. */
  private toOwnView(listing: Listing): Record<string, unknown> {
    const sortedGroups = (listing.optionGroups ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    return {
      id: listing.id,
      kind: listing.kind,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      price: Number(listing.price),
      stock: listing.stock,
      manualConfirm: listing.manualConfirm,
      // Opt-out of the vendor's delivery preset for this one item (list AND
      // detail views — the catalog list renders a chip).
      pickupOnly: !!listing.pickupOnly,
      status: listing.status,
      isSoldOut: isListingSoldOut(listing),
      viewCount: listing.viewCount,
      images: (listing.images ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((image) => ({ id: image.id, url: image.url, position: image.position })),
      optionGroups: sortedGroups.map((group) => ({
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
            stock: option.stock,
          })),
      })),
      createdAt: listing.createdAt,
    };
  }
}
