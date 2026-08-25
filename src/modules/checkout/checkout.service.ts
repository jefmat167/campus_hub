import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  Listing,
  ListingStatus,
} from '../../database/entities/listing.entity';
import { Offer } from '../../database/entities/offer.entity';
import { Checkout } from '../../database/entities/checkout.entity';
import {
  EscrowTransaction,
} from '../../database/entities/escrow.entity';
import { User } from '../../database/entities/user.entity';
import { effectiveTier } from '../../common/utils/effective-tier';
import { TIER_BUYING_LIMITS } from '../../common/constants/tier-limits';
import { toKobo, toNaira } from '../../common/utils/money';
import { CartService } from '../cart/cart.service';
import { EscrowService } from '../escrow/escrow.service';
import { WalletService } from '../wallet/wallet.service';
import {
  CheckoutDto,
  DirectCheckoutDto,
  MeetupSelectionDto,
} from './dto/checkout.dto';

interface PlanLine {
  listingId: string;
  sellerId: string;
  title: string;
  unitPrice: number; // naira (authoritative, recomputed server-side)
  offerId: string | null;
  meetupPoints: string[];
}

interface SubOrderPlan {
  sellerId: string;
  lines: PlanLine[];
  subtotalKobo: number;
  deliveryLocation: string;
}

export interface CheckoutResult {
  checkoutId: string;
  total: number;
  orders: Array<{
    id: string;
    orderNumber: string;
    sellerId: string;
    amount: number;
    itemCount: number;
    deliveryLocation: string | null;
  }>;
}

/**
 * The shared checkout (rev-2 spec 01.6 / 02.1 / 03.4):
 * - NO HOLDS anywhere before this point — checkout is what reserves items,
 *   via conditional ACTIVE→IN_ESCROW flips that lose gracefully on a race.
 * - ALL-OR-NOTHING: one DB transaction covers every listing flip, every
 *   sub-order + its items, and ONE wallet lock on the checkout total (which
 *   asserts balance and the daily velocity cap inside the wallet-row lock).
 * - Prices are recomputed server-side; an accepted offer's agreed price is
 *   honoured within its 24h lock.
 * - The tier buy-limit applies to the CHECKOUT TOTAL — enforced here in the
 *   service because a checkout has no single body field for the guard.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private dataSource: DataSource,
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    @InjectRepository(Offer)
    private offerRepo: Repository<Offer>,
    private cartService: CartService,
    private escrowService: EscrowService,
    private walletService: WalletService,
  ) { }

  async checkoutFromCart(user: User, dto: CheckoutDto): Promise<CheckoutResult> {
    const items = await this.cartService.getRawItems(user.id);
    if (items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }
    if (items.some((item) => !item.listingId)) {
      throw new BadRequestException(
        'Vendor items are not supported yet (rev-2 Phase 5)',
      );
    }

    const result = await this.execute(
      user,
      items.map((item) => ({
        listingId: item.listingId as string,
        offerId: item.offerId,
      })),
      dto.meetupSelections,
      dto.notes ?? null,
    );

    // The cart served its purpose; a failed checkout above leaves it intact.
    await this.cartService.clear(user.id);
    return result;
  }

  async checkoutDirect(
    user: User,
    dto: DirectCheckoutDto,
  ): Promise<CheckoutResult> {
    return this.execute(
      user,
      [{ listingId: dto.listingId, offerId: dto.offerId ?? null }],
      [{ listingId: dto.listingId, meetupPointIndex: dto.meetupPointIndex }],
      dto.notes ?? null,
    );
  }

  // ─── the pipeline ───────────────────────────────────────────────

  private async execute(
    user: User,
    rawLines: Array<{ listingId: string; offerId: string | null }>,
    selections: MeetupSelectionDto[],
    notes: string | null,
  ): Promise<CheckoutResult> {
    // 1) Validate every line and recompute authoritative prices. Failures are
    //    collected per line so the client can show exactly what went stale.
    const issues: Array<{ listingId: string; reason: string }> = [];
    const planLines: PlanLine[] = [];

    for (const raw of rawLines) {
      const listing = await this.listingRepo.findOne({
        where: { id: raw.listingId },
      });
      if (!listing || listing.status !== ListingStatus.ACTIVE) {
        issues.push({ listingId: raw.listingId, reason: 'listing_unavailable' });
        continue;
      }
      if (listing.sellerId === user.id) {
        issues.push({ listingId: raw.listingId, reason: 'own_listing' });
        continue;
      }

      let unitPrice = Number(listing.price);
      let offerId: string | null = null;
      if (raw.offerId) {
        const offer = await this.offerRepo.findOne({
          where: { id: raw.offerId },
        });
        if (
          !offer ||
          offer.buyerId !== user.id ||
          offer.listingId !== listing.id ||
          !this.cartService.isOfferLockValid(offer)
        ) {
          issues.push({ listingId: listing.id, reason: 'offer_lock_expired' });
          continue;
        }
        unitPrice = this.cartService.agreedOfferPrice(offer);
        offerId = offer.id;
      }

      planLines.push({
        listingId: listing.id,
        sellerId: listing.sellerId,
        title: listing.title,
        unitPrice,
        offerId,
        meetupPoints: listing.meetupPoints ?? [],
      });
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        message:
          'Some items can no longer be checked out. Review your cart and try again.',
        issues,
      });
    }

    // 2) Group into one sub-order plan per seller; resolve each group's
    //    meet-up point (one handover per seller — spec 02.1).
    const groups = new Map<string, PlanLine[]>();
    for (const line of planLines) {
      const group = groups.get(line.sellerId) ?? [];
      group.push(line);
      groups.set(line.sellerId, group);
    }

    const plans: SubOrderPlan[] = [];
    for (const [sellerId, lines] of groups) {
      const selection = (selections ?? []).find((sel) =>
        lines.some((line) => line.listingId === sel.listingId),
      );
      if (!selection) {
        throw new BadRequestException(
          'Pick a meet-up point for every seller in your cart',
        );
      }
      const anchor = lines.find(
        (line) => line.listingId === selection.listingId,
      ) as PlanLine;
      if (
        selection.meetupPointIndex < 0 ||
        selection.meetupPointIndex >= anchor.meetupPoints.length
      ) {
        throw new BadRequestException(
          'A valid meet-up point selection is required',
        );
      }

      plans.push({
        sellerId,
        lines,
        subtotalKobo: lines.reduce(
          (sum, line) => sum + toKobo(line.unitPrice),
          0,
        ),
        deliveryLocation: anchor.meetupPoints[selection.meetupPointIndex],
      });
    }

    const totalKobo = plans.reduce((sum, plan) => sum + plan.subtotalKobo, 0);
    const total = toNaira(totalKobo);

    // 3) Tier buy-limit on the CHECKOUT TOTAL (rev-2 spec 01.6).
    const tier = effectiveTier(user);
    const limit = TIER_BUYING_LIMITS[tier];
    if (limit !== null && limit !== undefined && total > limit) {
      throw new ForbiddenException({
        message: `Checkout total exceeds your tier limit. Maximum allowed: ₦${limit.toLocaleString()}`,
        limit,
        amount: total,
        currentTier: tier,
        upgradeRequired: true,
        scope: 'checkout_total',
      });
    }

    // 4) All-or-nothing: flips + sub-orders + ONE wallet lock, one transaction.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const checkoutId = randomUUID();
    const orders: EscrowTransaction[] = [];

    try {
      await queryRunner.manager.save(
        queryRunner.manager.create(Checkout, {
          id: checkoutId,
          buyerId: user.id,
          universityId: user.universityId ?? null,
          itemsSubtotal: total,
          deliveryFeeTotal: 0,
          total,
          walletReference: `CHECKOUT_${checkoutId}`,
        }),
      );

      for (const plan of plans) {
        // No holds before checkout means we must win the reservation race
        // here: a conditional UPDATE that only fires while still ACTIVE.
        for (const line of plan.lines) {
          const flip = await queryRunner.manager.update(
            Listing,
            { id: line.listingId, status: ListingStatus.ACTIVE },
            { status: ListingStatus.IN_ESCROW },
          );
          if (flip.affected !== 1) {
            throw new ConflictException({
              message:
                'An item was just bought by someone else. Refresh your cart and try again.',
              listingId: line.listingId,
            });
          }
        }

        orders.push(
          await this.escrowService.createP2pSubOrder(queryRunner, {
            checkoutId,
            buyerId: user.id,
            sellerId: plan.sellerId,
            amount: toNaira(plan.subtotalKobo),
            deliveryLocation: plan.deliveryLocation,
            notes,
            lines: plan.lines.map((line) => ({
              listingId: line.listingId,
              title: line.title,
              unitPrice: line.unitPrice,
              offerId: line.offerId,
            })),
          }),
        );
      }

      // One hold for the whole checkout — balance and the daily velocity cap
      // are asserted inside the wallet-row lock (spec 01.6). Any failure here
      // rolls back every flip and sub-order above.
      await this.walletService.lockFunds(
        user.id,
        total,
        `CHECKOUT_${checkoutId}`,
        queryRunner,
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    this.logger.log(
      `Checkout ${checkoutId}: ₦${total.toLocaleString()} across ${plans.length} sub-order(s) for buyer ${user.id}`,
    );

    // 5) Post-commit side effects per sub-order (never throw — money moved).
    for (const order of orders) {
      const plan = plans.find((p) => p.sellerId === order.sellerId) as SubOrderPlan;
      const label =
        plan.lines.length === 1
          ? plan.lines[0].title
          : `${plan.lines[0].title} + ${plan.lines.length - 1} more`;
      await this.escrowService.finalizeSubOrderPlacement(order, label);
    }

    return {
      checkoutId,
      total,
      orders: orders.map((order) => {
        const plan = plans.find((p) => p.sellerId === order.sellerId) as SubOrderPlan;
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          sellerId: order.sellerId,
          amount: Number(order.amount),
          itemCount: plan.lines.length,
          deliveryLocation: order.deliveryLocation,
        };
      }),
    };
  }
}
