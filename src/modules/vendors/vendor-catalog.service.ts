import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Not, Repository } from 'typeorm';
import {
  VendorListing,
  VendorListingImage,
  VendorListingStatus,
  VendorListingType,
} from '../../database/entities/vendor-listing.entity';
import {
  VendorOption,
  VendorOptionGroup,
} from '../../database/entities/vendor-option.entity';
import { VendorListingFulfillment } from '../../database/entities/vendor-listing-fulfillment.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { UploadService } from '../upload/upload.service';
import { isListingSoldOut } from './vendor-listing.util';
import {
  AdjustStockDto,
  CreateVendorListingDto,
  ReplaceFulfillmentDto,
  ReplaceOptionGroupsDto,
  UpdateVendorListingDto,
  VendorFulfillmentInputDto,
  VendorOptionGroupInputDto,
} from './dto/vendor-listing-input.dto';

const MAX_IMAGES = 5;

/**
 * The vendor write plane for the catalog (rev-2 spec 03.3 / 03.5):
 * goods & services with option groups, per-option stock, and per-university
 * fulfillment. Confirmation rule (decision log #8): services and
 * untracked-stock goods are always manual-confirm; auto-confirmation requires
 * tracked stock.
 */
@Injectable()
export class VendorCatalogService {
  private readonly logger = new Logger(VendorCatalogService.name);

  constructor(
    @InjectRepository(VendorListing)
    private listingRepo: Repository<VendorListing>,
    @InjectRepository(VendorListingImage)
    private imageRepo: Repository<VendorListingImage>,
    @InjectRepository(VendorOptionGroup)
    private groupRepo: Repository<VendorOptionGroup>,
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    private dataSource: DataSource,
    private uploadService: UploadService,
  ) { }

  async createListing(
    profile: VendorProfile,
    dto: CreateVendorListingDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);

    if (dto.type === VendorListingType.SERVICE && dto.stock !== undefined) {
      throw new BadRequestException(
        'Services carry no stock — there is nothing to count (rev-2 03.3)',
      );
    }
    const stock = dto.type === VendorListingType.SERVICE ? null : dto.stock ?? null;
    const manualConfirm = this.resolveManualConfirm(
      dto.type,
      stock,
      dto.manualConfirm,
    );

    if (dto.imageUrls && dto.imageUrls.length > 0) {
      await this.uploadService.verifyUploadedFileSizes(dto.imageUrls);
    }
    if (dto.fulfillment && dto.fulfillment.length > 0) {
      await this.assertFulfillmentWithinServed(profile.id, dto.fulfillment);
    }

    const listingId = await this.dataSource.transaction(async (manager) => {
      const listing = await manager.save(
        manager.create(VendorListing, {
          vendorProfileId: profile.id,
          type: dto.type,
          title: dto.title,
          description: dto.description,
          category: dto.category,
          basePrice: dto.basePrice,
          stock,
          manualConfirm,
          status: VendorListingStatus.ACTIVE,
        }),
      );

      for (const [index, url] of (dto.imageUrls ?? []).entries()) {
        await manager.save(
          manager.create(VendorListingImage, {
            vendorListingId: listing.id,
            url,
            position: index,
          }),
        );
      }

      await this.insertOptionGroups(manager, listing.id, dto.optionGroups ?? []);
      await this.insertFulfillment(manager, listing.id, dto.fulfillment ?? []);

      return listing.id;
    });

    this.logger.log(`Vendor ${profile.id} created listing ${listingId}`);
    return this.getOwnListing(profile, listingId);
  }

  async listOwn(
    profile: VendorProfile,
    status?: VendorListingStatus,
  ): Promise<Record<string, unknown>[]> {
    const listings = await this.listingRepo.find({
      where: {
        vendorProfileId: profile.id,
        status: status ?? Not(VendorListingStatus.DELETED),
      },
      relations: ['images', 'optionGroups', 'optionGroups.options'],
      order: { createdAt: 'DESC' },
    });
    return listings.map((listing) => this.toOwnView(listing, false));
  }

  async getOwnListing(
    profile: VendorProfile,
    listingId: string,
  ): Promise<Record<string, unknown>> {
    const listing = await this.findOwn(profile, listingId, true);
    return this.toOwnView(listing, true);
  }

  async updateListing(
    profile: VendorProfile,
    listingId: string,
    dto: UpdateVendorListingDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);
    const listing = await this.findOwn(profile, listingId, false);

    if (dto.stock !== undefined && listing.type === VendorListingType.SERVICE) {
      throw new BadRequestException('Services carry no stock');
    }

    if (dto.title !== undefined) listing.title = dto.title;
    if (dto.description !== undefined) listing.description = dto.description;
    if (dto.category !== undefined) listing.category = dto.category;
    if (dto.basePrice !== undefined) listing.basePrice = dto.basePrice;
    if (dto.status !== undefined) listing.status = dto.status;
    if (dto.stock !== undefined) listing.stock = dto.stock;

    // Re-derive the confirmation rule against the (possibly new) stock. An
    // EXPLICIT manualConfirm=false with untracked stock is a 400; an inherited
    // false is silently forced back to manual when stock stops being tracked.
    if (dto.manualConfirm !== undefined) {
      listing.manualConfirm = this.resolveManualConfirm(
        listing.type,
        listing.stock,
        dto.manualConfirm,
      );
    } else if (listing.stock === null && !listing.manualConfirm) {
      listing.manualConfirm = true;
    }

    if (dto.imageUrls && dto.imageUrls.length > 0) {
      await this.uploadService.verifyUploadedFileSizes(dto.imageUrls);
      const existing = await this.imageRepo.count({
        where: { vendorListingId: listing.id },
      });
      if (existing + dto.imageUrls.length > MAX_IMAGES) {
        throw new BadRequestException(
          `A listing can carry at most ${MAX_IMAGES} images`,
        );
      }
      for (const [index, url] of dto.imageUrls.entries()) {
        await this.imageRepo.save(
          this.imageRepo.create({
            vendorListingId: listing.id,
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
    listing.status = VendorListingStatus.DELETED;
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
    await this.findOwn(profile, listingId, false);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(VendorOptionGroup, { vendorListingId: listingId });
      await this.insertOptionGroups(manager, listingId, dto.groups);
    });

    return this.getOwnListing(profile, listingId);
  }

  /** Full replacement of the per-university fulfillment config. */
  async replaceFulfillment(
    profile: VendorProfile,
    listingId: string,
    dto: ReplaceFulfillmentDto,
  ): Promise<Record<string, unknown>> {
    this.assertActive(profile);
    await this.findOwn(profile, listingId, false);
    await this.assertFulfillmentWithinServed(profile.id, dto.universities);

    await this.dataSource.transaction(async (manager) => {
      await manager.delete(VendorListingFulfillment, {
        vendorListingId: listingId,
      });
      await this.insertFulfillment(manager, listingId, dto.universities);
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
    if (listing.type === VendorListingType.SERVICE) {
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
    await this.findOwn(profile, listingId, false);

    const group = await this.groupRepo
      .createQueryBuilder('g')
      .innerJoinAndSelect('g.options', 'o', 'o.id = :optionId', { optionId })
      .where('g.vendorListingId = :listingId', { listingId })
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

  /** Confirmation rule (rev-2 03.5 + decision log #8). */
  private resolveManualConfirm(
    type: VendorListingType,
    stock: number | null,
    requested?: boolean,
  ): boolean {
    if (type === VendorListingType.SERVICE) {
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

  private async assertFulfillmentWithinServed(
    vendorProfileId: string,
    rows: VendorFulfillmentInputDto[],
  ): Promise<void> {
    const ids = rows.map((row) => row.universityId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        'Duplicate university in the fulfillment config',
      );
    }
    const served = await this.vendorUniversityRepo.find({
      where: { vendorProfileId },
    });
    const servedSet = new Set(served.map((vu) => vu.universityId));
    for (const id of ids) {
      if (!servedSet.has(id)) {
        throw new BadRequestException(
          'Fulfillment can only be configured for universities this vendor serves',
        );
      }
    }
  }

  private async insertOptionGroups(
    manager: EntityManager,
    vendorListingId: string,
    groups: VendorOptionGroupInputDto[],
  ): Promise<void> {
    for (const [groupIndex, groupInput] of groups.entries()) {
      const group = await manager.save(
        manager.create(VendorOptionGroup, {
          vendorListingId,
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

  private async insertFulfillment(
    manager: EntityManager,
    vendorListingId: string,
    rows: VendorFulfillmentInputDto[],
  ): Promise<void> {
    for (const row of rows) {
      await manager.save(
        manager.create(VendorListingFulfillment, {
          vendorListingId,
          universityId: row.universityId,
          deliveryEnabled: row.deliveryEnabled,
          deliveryFee: row.deliveryEnabled ? row.deliveryFee ?? 0 : null,
        }),
      );
    }
  }

  private async findOwn(
    profile: VendorProfile,
    listingId: string,
    withRelations: boolean,
  ): Promise<VendorListing> {
    const listing = await this.listingRepo.findOne({
      where: { id: listingId, vendorProfileId: profile.id },
      relations: withRelations
        ? ['images', 'optionGroups', 'optionGroups.options', 'fulfillment']
        : [],
    });
    if (!listing || listing.status === VendorListingStatus.DELETED) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  /** Vendor-plane view: includes raw stock figures. */
  private toOwnView(
    listing: VendorListing,
    full: boolean,
  ): Record<string, unknown> {
    const sortedGroups = (listing.optionGroups ?? [])
      .slice()
      .sort((a, b) => a.position - b.position);
    return {
      id: listing.id,
      type: listing.type,
      title: listing.title,
      description: listing.description,
      category: listing.category,
      basePrice: Number(listing.basePrice),
      stock: listing.stock,
      manualConfirm: listing.manualConfirm,
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
      ...(full && {
        fulfillment: (listing.fulfillment ?? []).map((row) => ({
          universityId: row.universityId,
          deliveryEnabled: row.deliveryEnabled,
          deliveryFee: row.deliveryFee !== null ? Number(row.deliveryFee) : null,
        })),
      }),
      createdAt: listing.createdAt,
    };
  }
}
