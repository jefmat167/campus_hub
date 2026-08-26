import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart, CartItem } from '../../database/entities/cart.entity';
import {
  Listing,
  ListingStatus,
} from '../../database/entities/listing.entity';
import { Offer, OfferStatus } from '../../database/entities/offer.entity';
import {
  VendorListing,
  VendorListingStatus,
  VendorListingType,
} from '../../database/entities/vendor-listing.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';
import { User } from '../../database/entities/user.entity';
import { TimingPolicyService } from '../../common/services/timing-policy.service';
import { toKobo, toNaira } from '../../common/utils/money';
import { resolveVendorSelection } from '../vendors/vendor-listing.util';
import { AddCartItemDto } from './dto/add-cart-item.dto';

export interface CartLineView {
  id: string;
  kind: 'p2p' | 'vendor';
  /** Vendor lines: goods vs service — a service line needs a schedule at checkout. */
  listingType: 'goods' | 'service' | null;
  listingId: string | null;
  vendorListingId: string | null;
  title: string | null;
  sellerId: string | null;
  sellerName: string | null;
  vendorProfileId: string | null;
  businessName: string | null;
  meetupPoints: string[];
  quantity: number;
  priceAtAdd: number;
  currentPrice: number | null;
  lineTotal: number | null;
  offerId: string | null;
  selectedOptionIds: string[];
  issues: string[];
}

export interface CartView {
  id: string | null;
  lines: CartLineView[];
  sellers: Array<{
    sellerId: string;
    sellerName: string | null;
    lineCount: number;
    subtotal: number;
  }>;
  vendors: Array<{
    vendorProfileId: string;
    businessName: string | null;
    lineCount: number;
    subtotal: number;
  }>;
  itemsSubtotal: number;
  total: number;
  readyToCheckout: boolean;
}

/**
 * The shared cart (rev-2 spec 01.6): NO HOLDS — carting reserves nothing
 * (neither a P2P listing nor a unit of vendor stock); checkout validates and
 * reserves. Stale lines get flags, never silent drops. Vendor GOODS lines
 * since Phase 5; SERVICE lines since Phase 6 — always quantity 1, never
 * merged (each booking is its own sub-order with its own appointment), and
 * the proposed time is collected at CHECKOUT, not here (a carted time would
 * go stale).
 */
@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart)
    private cartRepo: Repository<Cart>,
    @InjectRepository(CartItem)
    private cartItemRepo: Repository<CartItem>,
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    @InjectRepository(Offer)
    private offerRepo: Repository<Offer>,
    @InjectRepository(VendorListing)
    private vendorListingRepo: Repository<VendorListing>,
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    private timingPolicy: TimingPolicyService,
  ) { }

  /** 24h price lock on an accepted offer (spec 01.6) — never a hold. */
  isOfferLockValid(offer: Offer): boolean {
    if (offer.status !== OfferStatus.ACCEPTED || !offer.respondedAt) {
      return false;
    }
    const lockMs =
      this.timingPolicy.resolve().offerLockHours * 60 * 60 * 1000;
    return Date.now() < new Date(offer.respondedAt).getTime() + lockMs;
  }

  /** The agreed price of an accepted offer (the counter, if one was accepted). */
  agreedOfferPrice(offer: Offer): number {
    return Number(offer.counterAmount ?? offer.amount);
  }

  async addItem(user: User, dto: AddCartItemDto): Promise<CartView> {
    const provided =
      (dto.listingId ? 1 : 0) +
      (dto.offerId ? 1 : 0) +
      (dto.vendorListingId ? 1 : 0);
    if (provided !== 1) {
      throw new BadRequestException(
        'Provide exactly one of listingId, offerId, or vendorListingId',
      );
    }

    if (dto.vendorListingId) {
      return this.addVendorItem(user, dto);
    }
    return this.addP2pItem(user, dto);
  }

  private async addP2pItem(user: User, dto: AddCartItemDto): Promise<CartView> {
    let listing: Listing | null;
    let offerId: string | null = null;
    let price: number;

    if (dto.offerId) {
      const offer = await this.offerRepo.findOne({
        where: { id: dto.offerId },
        relations: ['listing'],
      });
      if (!offer) {
        throw new NotFoundException('Offer not found');
      }
      if (offer.buyerId !== user.id) {
        throw new ForbiddenException('This offer is not yours');
      }
      if (!this.isOfferLockValid(offer)) {
        throw new BadRequestException(
          'This offer is not accepted or its 24h price lock has expired — negotiate again or add at the listed price',
        );
      }
      listing = offer.listing;
      offerId = offer.id;
      price = this.agreedOfferPrice(offer);
    } else {
      listing = await this.listingRepo.findOne({
        where: { id: dto.listingId },
      });
      price = listing ? Number(listing.price) : 0;
    }

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is not available');
    }
    if (listing.sellerId === user.id) {
      throw new BadRequestException('You cannot buy your own listing');
    }

    const cart = await this.getOrCreateCart(user.id);

    // One line per P2P listing per cart — re-adding refreshes the price/offer.
    let line = await this.cartItemRepo.findOne({
      where: { cartId: cart.id, listingId: listing.id },
    });
    if (line) {
      line.offerId = offerId;
      line.priceAtAdd = price;
    } else {
      line = this.cartItemRepo.create({
        cartId: cart.id,
        listingId: listing.id,
        offerId,
        quantity: 1,
        priceAtAdd: price,
      });
    }
    await this.cartItemRepo.save(line);

    return this.getCart(user);
  }

  private async addVendorItem(
    user: User,
    dto: AddCartItemDto,
  ): Promise<CartView> {
    if (!user.universityId) {
      throw new ForbiddenException(
        'This feature is only available to student accounts.',
      );
    }
    const quantity = dto.quantity ?? 1;
    const selectedOptionIds = dto.selectedOptionIds ?? [];

    const listing = await this.vendorListingRepo.findOne({
      where: { id: dto.vendorListingId as string },
      relations: ['vendorProfile', 'optionGroups', 'optionGroups.options'],
    });
    if (
      !listing ||
      listing.status !== VendorListingStatus.ACTIVE ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      throw new NotFoundException('Listing not found');
    }
    const isService = listing.type === VendorListingType.SERVICE;
    if (isService && quantity !== 1) {
      throw new BadRequestException(
        'A service booking is one appointment — add it again for another session',
      );
    }
    if (listing.vendorProfile.userId === user.id) {
      throw new BadRequestException('You cannot buy from your own storefront');
    }
    const serves = await this.vendorUniversityRepo.findOne({
      where: {
        vendorProfileId: listing.vendorProfileId,
        universityId: user.universityId,
      },
    });
    if (!serves) {
      throw new BadRequestException(
        'This vendor does not serve your university',
      );
    }

    const selection = resolveVendorSelection(
      listing,
      selectedOptionIds,
      quantity,
    );
    if (!selection.ok) {
      throw new BadRequestException(
        selection.reason === 'option_unavailable'
          ? 'A selected option is sold out or unavailable'
          : 'Invalid option selection for this listing',
      );
    }

    const cart = await this.getOrCreateCart(user.id);

    // Same GOODS listing + same option set merges into one line (quantity
    // adds up). Services never merge: each add is its own booking.
    const existing = isService
      ? []
      : await this.cartItemRepo.find({
        where: { cartId: cart.id, vendorListingId: listing.id },
      });
    const wanted = [...selectedOptionIds].sort().join(',');
    let line = existing.find(
      (item) =>
        [...this.lineOptionIds(item)].sort().join(',') === wanted,
    );
    const unitPrice = toNaira(selection.unitPriceKobo);
    if (line) {
      line.quantity = Math.min(99, line.quantity + quantity);
      line.priceAtAdd = unitPrice;
    } else {
      line = this.cartItemRepo.create({
        cartId: cart.id,
        vendorListingId: listing.id,
        quantity,
        selectedOptions: { optionIds: selectedOptionIds },
        priceAtAdd: unitPrice,
      });
    }
    await this.cartItemRepo.save(line);

    return this.getCart(user);
  }

  async removeItem(user: User, itemId: string): Promise<CartView> {
    const cart = await this.cartRepo.findOne({ where: { userId: user.id } });
    const line = cart
      ? await this.cartItemRepo.findOne({
        where: { id: itemId, cartId: cart.id },
      })
      : null;
    if (!line) {
      throw new NotFoundException('Cart item not found');
    }
    await this.cartItemRepo.delete(line.id);
    return this.getCart(user);
  }

  async clear(userId: string): Promise<void> {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (cart) {
      await this.cartItemRepo.delete({ cartId: cart.id });
    }
  }

  /** Raw lines for checkout (no view shaping, no freshness flags). */
  async getRawItems(userId: string): Promise<CartItem[]> {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) return [];
    return this.cartItemRepo.find({
      where: { cartId: cart.id },
      order: { createdAt: 'ASC' },
    });
  }

  lineOptionIds(item: CartItem): string[] {
    const raw = (item.selectedOptions as Record<string, unknown>)?.optionIds;
    return Array.isArray(raw) ? (raw as string[]) : [];
  }

  /** Cart view with per-line freshness flags and per-counterparty grouping. */
  async getCart(user: User): Promise<CartView> {
    const cart = await this.cartRepo.findOne({ where: { userId: user.id } });
    const items = cart
      ? await this.cartItemRepo.find({
        where: { cartId: cart.id },
        order: { createdAt: 'ASC' },
      })
      : [];

    const lines: CartLineView[] = [];
    for (const item of items) {
      if (item.vendorListingId) {
        lines.push(await this.buildVendorLineView(user, item));
      } else {
        lines.push(await this.buildP2pLineView(user, item));
      }
    }

    const sellerMap = new Map<
      string,
      { sellerId: string; sellerName: string | null; lineCount: number; subtotalKobo: number }
    >();
    const vendorMap = new Map<
      string,
      { vendorProfileId: string; businessName: string | null; lineCount: number; subtotalKobo: number }
    >();
    let itemsSubtotalKobo = 0;

    for (const line of lines) {
      if (line.issues.length > 0) continue;
      const unit = line.currentPrice ?? line.priceAtAdd;
      const lineKobo = toKobo(unit) * line.quantity;
      itemsSubtotalKobo += lineKobo;

      if (line.kind === 'p2p' && line.sellerId) {
        const group = sellerMap.get(line.sellerId) ?? {
          sellerId: line.sellerId,
          sellerName: line.sellerName,
          lineCount: 0,
          subtotalKobo: 0,
        };
        group.lineCount += 1;
        group.subtotalKobo += lineKobo;
        sellerMap.set(line.sellerId, group);
      }
      if (line.kind === 'vendor' && line.vendorProfileId) {
        const group = vendorMap.get(line.vendorProfileId) ?? {
          vendorProfileId: line.vendorProfileId,
          businessName: line.businessName,
          lineCount: 0,
          subtotalKobo: 0,
        };
        group.lineCount += 1;
        group.subtotalKobo += lineKobo;
        vendorMap.set(line.vendorProfileId, group);
      }
    }

    return {
      id: cart?.id ?? null,
      lines,
      sellers: Array.from(sellerMap.values()).map((g) => ({
        sellerId: g.sellerId,
        sellerName: g.sellerName,
        lineCount: g.lineCount,
        subtotal: toNaira(g.subtotalKobo),
      })),
      vendors: Array.from(vendorMap.values()).map((g) => ({
        vendorProfileId: g.vendorProfileId,
        businessName: g.businessName,
        lineCount: g.lineCount,
        subtotal: toNaira(g.subtotalKobo),
      })),
      itemsSubtotal: toNaira(itemsSubtotalKobo),
      total: toNaira(itemsSubtotalKobo),
      readyToCheckout:
        lines.length > 0 && lines.every((l) => l.issues.length === 0),
    };
  }

  private async buildP2pLineView(
    user: User,
    item: CartItem,
  ): Promise<CartLineView> {
    const listing = item.listingId
      ? await this.listingRepo.findOne({
        where: { id: item.listingId },
        relations: ['seller'],
      })
      : null;
    const offer = item.offerId
      ? await this.offerRepo.findOne({ where: { id: item.offerId } })
      : null;

    const issues: string[] = [];
    let currentPrice: number | null = null;

    if (!listing || listing.status !== ListingStatus.ACTIVE) {
      issues.push('listing_unavailable');
    }
    if (item.offerId) {
      if (!offer || !this.isOfferLockValid(offer)) {
        issues.push('offer_lock_expired');
      } else {
        currentPrice = this.agreedOfferPrice(offer);
      }
    } else if (listing) {
      currentPrice = Number(listing.price);
      if (toKobo(currentPrice) !== toKobo(Number(item.priceAtAdd))) {
        issues.push('price_changed');
      }
    }

    return {
      id: item.id,
      kind: 'p2p',
      listingType: null,
      listingId: item.listingId,
      vendorListingId: null,
      title: listing?.title ?? null,
      sellerId: listing?.sellerId ?? null,
      sellerName: listing?.seller?.fullName ?? null,
      vendorProfileId: null,
      businessName: null,
      meetupPoints: listing?.meetupPoints ?? [],
      quantity: 1,
      priceAtAdd: Number(item.priceAtAdd),
      currentPrice,
      lineTotal: currentPrice,
      offerId: item.offerId,
      selectedOptionIds: [],
      issues,
    };
  }

  private async buildVendorLineView(
    user: User,
    item: CartItem,
  ): Promise<CartLineView> {
    const listing = await this.vendorListingRepo.findOne({
      where: { id: item.vendorListingId as string },
      relations: ['vendorProfile', 'optionGroups', 'optionGroups.options'],
    });
    const selectedOptionIds = this.lineOptionIds(item);

    const issues: string[] = [];
    let currentPrice: number | null = null;

    if (
      !listing ||
      listing.status !== VendorListingStatus.ACTIVE ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      issues.push('listing_unavailable');
    } else {
      if (user.universityId) {
        const serves = await this.vendorUniversityRepo.findOne({
          where: {
            vendorProfileId: listing.vendorProfileId,
            universityId: user.universityId,
          },
        });
        if (!serves) issues.push('vendor_not_serving');
      } else {
        issues.push('vendor_not_serving');
      }

      const selection = resolveVendorSelection(
        listing,
        selectedOptionIds,
        item.quantity,
      );
      if (!selection.ok) {
        issues.push(selection.reason);
      } else {
        currentPrice = toNaira(selection.unitPriceKobo);
        if (selection.unitPriceKobo !== toKobo(Number(item.priceAtAdd))) {
          issues.push('price_changed');
        }
      }
    }

    return {
      id: item.id,
      kind: 'vendor',
      listingType: listing?.type ?? null,
      listingId: null,
      vendorListingId: item.vendorListingId,
      title: listing?.title ?? null,
      sellerId: listing?.vendorProfile?.userId ?? null,
      sellerName: null,
      vendorProfileId: listing?.vendorProfileId ?? null,
      businessName: listing?.vendorProfile?.businessName ?? null,
      meetupPoints: [],
      quantity: item.quantity,
      priceAtAdd: Number(item.priceAtAdd),
      currentPrice,
      lineTotal:
        currentPrice !== null
          ? toNaira(toKobo(currentPrice) * item.quantity)
          : null,
      offerId: null,
      selectedOptionIds,
      issues,
    };
  }

  private async getOrCreateCart(userId: string): Promise<Cart> {
    let cart = await this.cartRepo.findOne({ where: { userId } });
    if (!cart) {
      cart = await this.cartRepo.save(this.cartRepo.create({ userId }));
    }
    return cart;
  }
}
