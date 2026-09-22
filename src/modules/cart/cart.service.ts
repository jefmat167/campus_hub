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
  ListingKind,
  ListingStatus,
} from '../../database/entities/listing.entity';
import { Offer, OfferStatus } from '../../database/entities/offer.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';
import { User } from '../../database/entities/user.entity';
import { TimingPolicyService } from '../../common/services/timing-policy.service';
import { toKobo, toNaira } from '../../common/utils/money';
import { resolveVendorSelection } from '../vendors/vendor-listing.util';
import { AddCartItemDto } from './dto/add-cart-item.dto';

export interface CartLineView {
  id: string;
  /** p2p | vendor_goods | vendor_service — a service line needs a schedule at checkout. */
  kind: ListingKind;
  listingId: string;
  title: string | null;
  sellerId: string | null;
  sellerName: string | null;
  vendorProfileId: string | null;
  businessName: string | null;
  meetupPoints: string[];
  /**
   * Vendor kinds only: this listing opts out of the vendor's delivery preset
   * (goods pickup-only / service at-the-shop only). Undefined on P2P lines.
   */
  pickupOnly?: boolean;
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

const LISTING_RELATIONS = [
  'seller',
  'vendorProfile',
  'optionGroups',
  'optionGroups.options',
];

/**
 * The shared cart (rev-2 spec 01.6): NO HOLDS — carting reserves nothing
 * (neither a P2P listing nor a unit of vendor stock); checkout validates and
 * reserves. Stale lines get flags, never silent drops. Every kind lives on the
 * one listings table (unified marketplace): P2P lines are always quantity 1
 * and dedupe per listing; vendor GOODS lines merge per option set; SERVICE
 * lines are always quantity 1 and never merge (each booking is its own
 * sub-order with its own appointment — the time is collected at CHECKOUT).
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
    const provided = (dto.listingId ? 1 : 0) + (dto.offerId ? 1 : 0);
    if (provided !== 1) {
      throw new BadRequestException('Provide exactly one of listingId or offerId');
    }

    if (dto.offerId) {
      return this.addP2pItemFromOffer(user, dto.offerId);
    }

    const listing = await this.listingRepo.findOne({
      where: { id: dto.listingId as string },
      relations: LISTING_RELATIONS,
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    return listing.kind === ListingKind.P2P
      ? this.addP2pItem(user, listing, null, Number(listing.price))
      : this.addVendorItem(user, listing, dto);
  }

  private async addP2pItemFromOffer(user: User, offerId: string): Promise<CartView> {
    const offer = await this.offerRepo.findOne({
      where: { id: offerId },
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
    if (!offer.listing) {
      throw new NotFoundException('Listing not found');
    }
    return this.addP2pItem(user, offer.listing, offer.id, this.agreedOfferPrice(offer));
  }

  private async addP2pItem(
    user: User,
    listing: Listing,
    offerId: string | null,
    price: number,
  ): Promise<CartView> {
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
    listing: Listing,
    dto: AddCartItemDto,
  ): Promise<CartView> {
    if (!user.universityId) {
      throw new ForbiddenException(
        'This feature is only available to student accounts.',
      );
    }
    const quantity = dto.quantity ?? 1;
    const selectedOptionIds = dto.selectedOptionIds ?? [];

    if (
      listing.status !== ListingStatus.ACTIVE ||
      !listing.vendorProfile ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      throw new NotFoundException('Listing not found');
    }
    const isService = listing.kind === ListingKind.VENDOR_SERVICE;
    if (isService && quantity !== 1) {
      throw new BadRequestException(
        'A service booking is one appointment — add it again for another session',
      );
    }
    if (listing.sellerId === user.id) {
      throw new BadRequestException('You cannot buy from your own storefront');
    }
    const serves = await this.vendorUniversityRepo.findOne({
      where: {
        vendorProfileId: listing.vendorProfileId as string,
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
        where: { cartId: cart.id, listingId: listing.id },
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
        listingId: listing.id,
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
      const listing = await this.listingRepo.findOne({
        where: { id: item.listingId },
        relations: LISTING_RELATIONS,
      });
      if (!listing || listing.kind === ListingKind.P2P) {
        lines.push(await this.buildP2pLineView(item, listing));
      } else {
        lines.push(await this.buildVendorLineView(user, item, listing));
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

      if (line.kind === ListingKind.P2P && line.sellerId) {
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
      if (line.kind !== ListingKind.P2P && line.vendorProfileId) {
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
    item: CartItem,
    listing: Listing | null,
  ): Promise<CartLineView> {
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
      kind: ListingKind.P2P,
      listingId: item.listingId,
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
    listing: Listing,
  ): Promise<CartLineView> {
    const selectedOptionIds = this.lineOptionIds(item);

    const issues: string[] = [];
    let currentPrice: number | null = null;

    if (
      listing.status !== ListingStatus.ACTIVE ||
      !listing.vendorProfile ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      issues.push('listing_unavailable');
    } else {
      if (user.universityId) {
        const serves = await this.vendorUniversityRepo.findOne({
          where: {
            vendorProfileId: listing.vendorProfileId as string,
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
      kind: listing.kind,
      listingId: item.listingId,
      title: listing.title,
      sellerId: listing.sellerId,
      sellerName: null,
      vendorProfileId: listing.vendorProfileId,
      businessName: listing.vendorProfile?.businessName ?? null,
      meetupPoints: [],
      pickupOnly: !!listing.pickupOnly,
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
