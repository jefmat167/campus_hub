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
import { TimingPolicyService } from '../../common/services/timing-policy.service';
import { toKobo, toNaira } from '../../common/utils/money';
import { AddCartItemDto } from './dto/add-cart-item.dto';

export interface CartLineView {
  id: string;
  listingId: string | null;
  title: string | null;
  sellerId: string | null;
  sellerName: string | null;
  meetupPoints: string[];
  priceAtAdd: number;
  currentPrice: number | null;
  offerId: string | null;
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
  itemsSubtotal: number;
  total: number;
  readyToCheckout: boolean;
}

/**
 * The shared cart (rev-2 spec 01.6): NO HOLDS — carting reserves nothing;
 * checkout validates and reserves. The cart view flags stale lines instead of
 * silently dropping them, so the buyer always confirms what changed.
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
    private timingPolicy: TimingPolicyService,
  ) { }

  /**
   * Is an accepted offer's price lock still valid? 24h from acceptance
   * (spec 01.6) — acceptance never reserves the item, only the price.
   */
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

  async addItem(userId: string, dto: AddCartItemDto): Promise<CartView> {
    const provided = (dto.listingId ? 1 : 0) + (dto.offerId ? 1 : 0);
    if (provided !== 1) {
      throw new BadRequestException(
        'Provide exactly one of listingId or offerId',
      );
    }

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
      if (offer.buyerId !== userId) {
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
    if (listing.sellerId === userId) {
      throw new BadRequestException('You cannot buy your own listing');
    }

    const cart = await this.getOrCreateCart(userId);

    // One line per listing per cart — re-adding refreshes the price/offer.
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

    return this.getCart(userId);
  }

  async removeItem(userId: string, itemId: string): Promise<CartView> {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    const line = cart
      ? await this.cartItemRepo.findOne({
        where: { id: itemId, cartId: cart.id },
      })
      : null;
    if (!line) {
      throw new NotFoundException('Cart item not found');
    }
    await this.cartItemRepo.delete(line.id);
    return this.getCart(userId);
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

  /** Cart view with per-line freshness flags and per-seller grouping. */
  async getCart(userId: string): Promise<CartView> {
    const cart = await this.cartRepo.findOne({ where: { userId } });
    const items = cart
      ? await this.cartItemRepo.find({
        where: { cartId: cart.id },
        order: { createdAt: 'ASC' },
      })
      : [];

    const lines: CartLineView[] = [];
    for (const item of items) {
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

      lines.push({
        id: item.id,
        listingId: item.listingId,
        title: listing?.title ?? null,
        sellerId: listing?.sellerId ?? null,
        sellerName: listing?.seller?.fullName ?? null,
        meetupPoints: listing?.meetupPoints ?? [],
        priceAtAdd: Number(item.priceAtAdd),
        currentPrice,
        offerId: item.offerId,
        issues,
      });
    }

    const sellerMap = new Map<
      string,
      { sellerId: string; sellerName: string | null; lineCount: number; subtotalKobo: number }
    >();
    let itemsSubtotalKobo = 0;
    for (const line of lines) {
      if (!line.sellerId || line.issues.length > 0) continue;
      const price = line.currentPrice ?? line.priceAtAdd;
      itemsSubtotalKobo += toKobo(price);
      const group = sellerMap.get(line.sellerId) ?? {
        sellerId: line.sellerId,
        sellerName: line.sellerName,
        lineCount: 0,
        subtotalKobo: 0,
      };
      group.lineCount += 1;
      group.subtotalKobo += toKobo(price);
      sellerMap.set(line.sellerId, group);
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
      itemsSubtotal: toNaira(itemsSubtotalKobo),
      total: toNaira(itemsSubtotalKobo),
      readyToCheckout:
        lines.length > 0 && lines.every((l) => l.issues.length === 0),
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
