import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  DeliveryMethod,
  Listing,
  ListingStatus,
} from '../../database/entities/listing.entity';
import { Offer } from '../../database/entities/offer.entity';
import { Checkout } from '../../database/entities/checkout.entity';
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import {
  VendorListing,
  VendorListingStatus,
  VendorListingType,
} from '../../database/entities/vendor-listing.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';
import { User } from '../../database/entities/user.entity';
import { effectiveTier } from '../../common/utils/effective-tier';
import { TIER_BUYING_LIMITS } from '../../common/constants/tier-limits';
import { toKobo, toNaira } from '../../common/utils/money';
import { resolveVendorSelection } from '../vendors/vendor-listing.util';
import { CartService } from '../cart/cart.service';
import { EscrowService } from '../escrow/escrow.service';
import { WalletService } from '../wallet/wallet.service';
import {
  CheckoutDto,
  DirectCheckoutDto,
  MeetupSelectionDto,
  VendorFulfillmentChoiceDto,
} from './dto/checkout.dto';

interface RawLine {
  kind: 'p2p' | 'vendor';
  listingId?: string | null;
  offerId?: string | null;
  vendorListingId?: string | null;
  quantity: number;
  selectedOptionIds: string[];
}

interface P2pPlanLine {
  listingId: string;
  sellerId: string;
  title: string;
  unitPrice: number;
  offerId: string | null;
  meetupPoints: string[];
}

interface P2pPlan {
  sellerId: string;
  lines: P2pPlanLine[];
  subtotalKobo: number;
  deliveryLocation: string;
}

interface VendorPlanLine {
  listing: VendorListing;
  quantity: number;
  unitPriceKobo: number;
  selectedOptionIds: string[];
  optionsSnapshot: Record<string, unknown>;
}

interface VendorPlan {
  vendorProfileId: string;
  sellerId: string;
  businessName: string;
  homeUniversityId: string;
  shopAddress: string | null;
  lines: VendorPlanLine[];
  itemsSubtotalKobo: number;
  deliveryFeeKobo: number;
  deliveryMethod: DeliveryMethod;
  deliveryLocation: string;
  deliveryAddress: string | null;
  dropPointId: string | null;
  confirmationRequired: boolean;
}

export interface CheckoutResult {
  checkoutId: string;
  total: number;
  orders: Array<{
    id: string;
    orderNumber: string;
    market: string | null;
    status: string;
    sellerId: string;
    amount: number;
    itemCount: number;
    deliveryMethod: string | null;
    deliveryLocation: string | null;
  }>;
}

/**
 * The shared checkout (rev-2 spec 01.6 / 02.1 / 03.2 / 03.4):
 * - NO HOLDS before this point — reservation happens here: conditional
 *   ACTIVE→IN_ESCROW flips for P2P listings, conditional stock decrements
 *   for vendor goods (base + per-option), all race-checked.
 * - ONE wallet lock on the checkout total (balance + daily velocity cap
 *   asserted inside the wallet-row lock); tier buy-limit on the TOTAL.
 * - One sub-order per counterparty: per P2P seller, per vendor. Vendor
 *   fulfillment is chosen once per sub-order (pickup / delivery), delivery
 *   fee = the HIGHEST single line fee (one trip, not one per item), and
 *   neighboring-university delivery goes to an admin drop point only.
 * - Manual-confirmation vendor orders start PENDING_CONFIRMATION.
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
    @InjectRepository(VendorListing)
    private vendorListingRepo: Repository<VendorListing>,
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    @InjectRepository(DropPoint)
    private dropPointRepo: Repository<DropPoint>,
    private cartService: CartService,
    private escrowService: EscrowService,
    private walletService: WalletService,
  ) { }

  async checkoutFromCart(user: User, dto: CheckoutDto): Promise<CheckoutResult> {
    const items = await this.cartService.getRawItems(user.id);
    if (items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const rawLines: RawLine[] = items.map((item) => ({
      kind: item.vendorListingId ? 'vendor' : 'p2p',
      listingId: item.listingId,
      offerId: item.offerId,
      vendorListingId: item.vendorListingId,
      quantity: item.quantity,
      selectedOptionIds: this.cartService.lineOptionIds(item),
    }));

    const result = await this.execute(
      user,
      rawLines,
      dto.meetupSelections ?? [],
      dto.vendorFulfillment ?? [],
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
      [
        {
          kind: 'p2p',
          listingId: dto.listingId,
          offerId: dto.offerId ?? null,
          quantity: 1,
          selectedOptionIds: [],
        },
      ],
      [{ listingId: dto.listingId, meetupPointIndex: dto.meetupPointIndex }],
      [],
      dto.notes ?? null,
    );
  }

  // ─── the pipeline ───────────────────────────────────────────────

  private async execute(
    user: User,
    rawLines: RawLine[],
    selections: MeetupSelectionDto[],
    vendorChoices: VendorFulfillmentChoiceDto[],
    notes: string | null,
  ): Promise<CheckoutResult> {
    // 1) Validate + reprice every line server-side; collect per-line issues.
    const issues: Array<{ listingId: string; reason: string }> = [];
    const p2pLines: P2pPlanLine[] = [];
    const vendorLines: Array<VendorPlanLine & { vendorListing: VendorListing }> = [];

    for (const raw of rawLines) {
      if (raw.kind === 'vendor') {
        await this.validateVendorLine(user, raw, issues, vendorLines);
      } else {
        await this.validateP2pLine(user, raw, issues, p2pLines);
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        message:
          'Some items can no longer be checked out. Review your cart and try again.',
        issues,
      });
    }

    // 2) Group into sub-order plans.
    const p2pPlans = this.buildP2pPlans(p2pLines, selections);
    const vendorPlans = await this.buildVendorPlans(
      user,
      vendorLines,
      vendorChoices,
    );

    const itemsSubtotalKobo =
      p2pPlans.reduce((sum, plan) => sum + plan.subtotalKobo, 0) +
      vendorPlans.reduce((sum, plan) => sum + plan.itemsSubtotalKobo, 0);
    const deliveryTotalKobo = vendorPlans.reduce(
      (sum, plan) => sum + plan.deliveryFeeKobo,
      0,
    );
    const totalKobo = itemsSubtotalKobo + deliveryTotalKobo;
    const total = toNaira(totalKobo);

    // 3) Tier buy-limit on the CHECKOUT TOTAL — items + delivery fees,
    //    everything the buyer pays (rev-2 spec 01.6).
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

    // 4) All-or-nothing: reservations + sub-orders + ONE wallet lock.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const checkoutId = randomUUID();
    const orders: EscrowTransaction[] = [];
    const labels = new Map<string, string>();

    try {
      await queryRunner.manager.save(
        queryRunner.manager.create(Checkout, {
          id: checkoutId,
          buyerId: user.id,
          universityId: user.universityId ?? null,
          itemsSubtotal: toNaira(itemsSubtotalKobo),
          deliveryFeeTotal: toNaira(deliveryTotalKobo),
          total,
          walletReference: `CHECKOUT_${checkoutId}`,
        }),
      );

      for (const plan of p2pPlans) {
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

        const order = await this.escrowService.createP2pSubOrder(queryRunner, {
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
        });
        orders.push(order);
        labels.set(order.id, this.labelFor(plan.lines.map((l) => l.title)));
      }

      for (const plan of vendorPlans) {
        await this.decrementVendorStock(queryRunner, plan);

        const order = await this.escrowService.createVendorSubOrder(
          queryRunner,
          {
            checkoutId,
            buyerId: user.id,
            sellerId: plan.sellerId,
            amount: toNaira(plan.itemsSubtotalKobo + plan.deliveryFeeKobo),
            itemsSubtotal: toNaira(plan.itemsSubtotalKobo),
            deliveryFee: toNaira(plan.deliveryFeeKobo),
            deliveryMethod: plan.deliveryMethod,
            deliveryLocation: plan.deliveryLocation,
            deliveryAddress: plan.deliveryAddress,
            dropPointId: plan.dropPointId,
            confirmationRequired: plan.confirmationRequired,
            notes,
            lines: plan.lines.map((line) => ({
              vendorListingId: line.listing.id,
              title: line.listing.title,
              unitPrice: toNaira(line.unitPriceKobo),
              quantity: line.quantity,
              lineTotal: toNaira(line.unitPriceKobo * line.quantity),
              optionsSnapshot: line.optionsSnapshot,
            })),
          },
        );
        orders.push(order);
        labels.set(
          order.id,
          this.labelFor(plan.lines.map((l) => l.listing.title)),
        );
      }

      // One hold for the whole checkout — balance and the daily velocity cap
      // are asserted inside the wallet-row lock (spec 01.6).
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
      `Checkout ${checkoutId}: ₦${total.toLocaleString()} across ${orders.length} sub-order(s) for buyer ${user.id}`,
    );

    // 5) Post-commit side effects per sub-order (never throw — money moved).
    for (const order of orders) {
      const label = labels.get(order.id) ?? 'your order';
      if (order.market === 'vendor') {
        await this.escrowService.finalizeVendorSubOrderPlacement(order, label);
      } else {
        await this.escrowService.finalizeSubOrderPlacement(order, label);
      }
    }

    return {
      checkoutId,
      total,
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        market: order.market,
        status: order.status,
        sellerId: order.sellerId,
        amount: Number(order.amount),
        itemCount:
          p2pPlans.find((p) => p.sellerId === order.sellerId)?.lines.length ??
          vendorPlans.find((p) => p.sellerId === order.sellerId)?.lines.length ??
          1,
        deliveryMethod: order.deliveryMethod,
        deliveryLocation: order.deliveryLocation,
      })),
    };
  }

  // ─── line validation ────────────────────────────────────────────

  private async validateP2pLine(
    user: User,
    raw: RawLine,
    issues: Array<{ listingId: string; reason: string }>,
    out: P2pPlanLine[],
  ): Promise<void> {
    const listing = await this.listingRepo.findOne({
      where: { id: raw.listingId as string },
    });
    if (!listing || listing.status !== ListingStatus.ACTIVE) {
      issues.push({
        listingId: raw.listingId as string,
        reason: 'listing_unavailable',
      });
      return;
    }
    if (listing.sellerId === user.id) {
      issues.push({ listingId: listing.id, reason: 'own_listing' });
      return;
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
        return;
      }
      unitPrice = this.cartService.agreedOfferPrice(offer);
      offerId = offer.id;
    }

    out.push({
      listingId: listing.id,
      sellerId: listing.sellerId,
      title: listing.title,
      unitPrice,
      offerId,
      meetupPoints: listing.meetupPoints ?? [],
    });
  }

  private async validateVendorLine(
    user: User,
    raw: RawLine,
    issues: Array<{ listingId: string; reason: string }>,
    out: Array<VendorPlanLine & { vendorListing: VendorListing }>,
  ): Promise<void> {
    const id = raw.vendorListingId as string;
    const listing = await this.vendorListingRepo.findOne({
      where: { id },
      relations: [
        'vendorProfile',
        'optionGroups',
        'optionGroups.options',
        'fulfillment',
      ],
    });
    if (
      !listing ||
      listing.status !== VendorListingStatus.ACTIVE ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      issues.push({ listingId: id, reason: 'listing_unavailable' });
      return;
    }
    if (listing.type === VendorListingType.SERVICE) {
      issues.push({ listingId: id, reason: 'service_not_supported' });
      return;
    }
    if (listing.vendorProfile.userId === user.id) {
      issues.push({ listingId: id, reason: 'own_listing' });
      return;
    }
    if (!user.universityId) {
      issues.push({ listingId: id, reason: 'vendor_not_serving' });
      return;
    }
    const serves = await this.vendorUniversityRepo.findOne({
      where: {
        vendorProfileId: listing.vendorProfileId,
        universityId: user.universityId,
      },
    });
    if (!serves) {
      issues.push({ listingId: id, reason: 'vendor_not_serving' });
      return;
    }

    const selection = resolveVendorSelection(
      listing,
      raw.selectedOptionIds,
      raw.quantity,
    );
    if (!selection.ok) {
      issues.push({ listingId: id, reason: selection.reason });
      return;
    }

    out.push({
      listing,
      vendorListing: listing,
      quantity: raw.quantity,
      unitPriceKobo: selection.unitPriceKobo,
      selectedOptionIds: raw.selectedOptionIds,
      optionsSnapshot: {
        optionIds: raw.selectedOptionIds,
        selections: selection.selectedOptions,
      },
    });
  }

  // ─── planning ───────────────────────────────────────────────────

  private buildP2pPlans(
    lines: P2pPlanLine[],
    selections: MeetupSelectionDto[],
  ): P2pPlan[] {
    const groups = new Map<string, P2pPlanLine[]>();
    for (const line of lines) {
      const group = groups.get(line.sellerId) ?? [];
      group.push(line);
      groups.set(line.sellerId, group);
    }

    const plans: P2pPlan[] = [];
    for (const [sellerId, groupLines] of groups) {
      const selection = (selections ?? []).find((sel) =>
        groupLines.some((line) => line.listingId === sel.listingId),
      );
      if (!selection) {
        throw new BadRequestException(
          'Pick a meet-up point for every seller in your cart',
        );
      }
      const anchor = groupLines.find(
        (line) => line.listingId === selection.listingId,
      ) as P2pPlanLine;
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
        lines: groupLines,
        subtotalKobo: groupLines.reduce(
          (sum, line) => sum + toKobo(line.unitPrice),
          0,
        ),
        deliveryLocation: anchor.meetupPoints[selection.meetupPointIndex],
      });
    }
    return plans;
  }

  private async buildVendorPlans(
    user: User,
    lines: Array<VendorPlanLine & { vendorListing: VendorListing }>,
    choices: VendorFulfillmentChoiceDto[],
  ): Promise<VendorPlan[]> {
    const groups = new Map<string, Array<VendorPlanLine & { vendorListing: VendorListing }>>();
    for (const line of lines) {
      const key = line.vendorListing.vendorProfileId;
      const group = groups.get(key) ?? [];
      group.push(line);
      groups.set(key, group);
    }

    const plans: VendorPlan[] = [];
    for (const [vendorProfileId, groupLines] of groups) {
      const profile = groupLines[0].vendorListing.vendorProfile;
      const choice = (choices ?? []).find(
        (c) => c.vendorProfileId === vendorProfileId,
      );
      if (!choice) {
        throw new BadRequestException(
          `Choose pickup or delivery for ${profile.businessName}`,
        );
      }

      const itemsSubtotalKobo = groupLines.reduce(
        (sum, line) => sum + line.unitPriceKobo * line.quantity,
        0,
      );

      let deliveryMethod: DeliveryMethod;
      let deliveryFeeKobo = 0;
      let deliveryLocation: string;
      let deliveryAddress: string | null = null;
      let dropPointId: string | null = null;

      if (choice.method === 'pickup') {
        // Pickup at the shop — always available at served universities (03.2).
        deliveryMethod = DeliveryMethod.PICKUP;
        deliveryLocation =
          profile.shopAddress?.trim() || `${profile.businessName} (pickup at the shop)`;
      } else {
        deliveryMethod = DeliveryMethod.DELIVERY;

        // Every line must opt in to delivery for the buyer's university —
        // one pickup-only item forces the whole sub-order to pickup (03.2).
        const feesKobo: number[] = [];
        for (const line of groupLines) {
          const row = (line.vendorListing.fulfillment ?? []).find(
            (f) => f.universityId === user.universityId,
          );
          if (!row || !row.deliveryEnabled) {
            throw new BadRequestException(
              `"${line.vendorListing.title}" is pickup-only for your university — choose pickup for ${profile.businessName}`,
            );
          }
          feesKobo.push(toKobo(Number(row.deliveryFee ?? 0)));
        }
        // One trip, not one per item: charge only the HIGHEST single fee (03.2).
        deliveryFeeKobo = Math.max(...feesKobo, 0);

        const isHome = profile.homeUniversityId === user.universityId;
        if (isHome) {
          const provided =
            (choice.deliveryAddress?.trim() ? 1 : 0) +
            (choice.dropPointId ? 1 : 0);
          if (provided !== 1) {
            throw new BadRequestException(
              'Provide exactly one of deliveryAddress or dropPointId for home-university delivery',
            );
          }
        } else if (!choice.dropPointId || choice.deliveryAddress) {
          // Neighboring-university delivery: admin drop point ONLY — never a
          // personal address (03.2).
          throw new BadRequestException(
            'Delivery from a neighboring-campus vendor goes to an admin drop point at your university — pick one',
          );
        }

        if (choice.dropPointId) {
          const dropPoint = await this.dropPointRepo.findOne({
            where: {
              id: choice.dropPointId,
              universityId: user.universityId as string,
              isActive: true,
            },
          });
          if (!dropPoint) {
            throw new BadRequestException(
              'Choose an active drop point at your university',
            );
          }
          dropPointId = dropPoint.id;
          deliveryLocation = `Drop point: ${dropPoint.name}`;
        } else {
          deliveryAddress = (choice.deliveryAddress as string).trim();
          deliveryLocation = deliveryAddress;
        }
      }

      plans.push({
        vendorProfileId,
        sellerId: profile.userId,
        businessName: profile.businessName,
        homeUniversityId: profile.homeUniversityId,
        shopAddress: profile.shopAddress,
        lines: groupLines,
        itemsSubtotalKobo,
        deliveryFeeKobo,
        deliveryMethod,
        deliveryLocation,
        deliveryAddress,
        dropPointId,
        confirmationRequired: groupLines.some(
          (line) => line.vendorListing.manualConfirm,
        ),
      });
    }
    return plans;
  }

  // ─── stock reservation (race-checked, inside the checkout tx) ────

  private async decrementVendorStock(
    queryRunner: QueryRunner,
    plan: VendorPlan,
  ): Promise<void> {
    for (const line of plan.lines) {
      if (line.listing.stock !== null) {
        const rows: unknown[] = await queryRunner.manager.query(
          `UPDATE "vendor_listings" SET "stock" = "stock" - $1
           WHERE "id" = $2 AND "status" = 'active' AND "stock" >= $1
           RETURNING "id"`,
          [line.quantity, line.listing.id],
        );
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new ConflictException({
            message: 'An item just sold out. Refresh your cart and try again.',
            listingId: line.listing.id,
          });
        }
      } else {
        // Untracked stock: just re-verify the listing is still active.
        const active = await queryRunner.manager.findOne(VendorListing, {
          where: { id: line.listing.id, status: VendorListingStatus.ACTIVE },
        });
        if (!active) {
          throw new ConflictException({
            message:
              'An item is no longer available. Refresh your cart and try again.',
            listingId: line.listing.id,
          });
        }
      }

      // Selected options with tracked stock decrement by the line quantity.
      const trackedSelected = (line.listing.optionGroups ?? [])
        .flatMap((group) => group.options ?? [])
        .filter(
          (option) =>
            line.selectedOptionIds.includes(option.id) && option.stock !== null,
        );
      for (const option of trackedSelected) {
        const rows: unknown[] = await queryRunner.manager.query(
          `UPDATE "options" SET "stock" = "stock" - $1
           WHERE "id" = $2 AND "stock" >= $1
           RETURNING "id"`,
          [line.quantity, option.id],
        );
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new ConflictException({
            message:
              'A selected option just sold out. Refresh your cart and try again.',
            listingId: line.listing.id,
          });
        }
      }
    }
  }

  private labelFor(titles: string[]): string {
    return titles.length === 1
      ? titles[0]
      : `${titles[0]} + ${titles.length - 1} more`;
  }
}
