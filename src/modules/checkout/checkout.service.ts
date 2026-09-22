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
  ListingKind,
  ListingStatus,
} from '../../database/entities/listing.entity';
import { Offer } from '../../database/entities/offer.entity';
import { Checkout } from '../../database/entities/checkout.entity';
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { User } from '../../database/entities/user.entity';
import { effectiveTier } from '../../common/utils/effective-tier';
import { TIER_BUYING_LIMITS } from '../../common/constants/tier-limits';
import { toKobo, toNaira } from '../../common/utils/money';
import { resolveVendorSelection } from '../vendors/vendor-listing.util';
import {
  CampusDeliveryPreset,
  VendorDeliveryService,
} from '../vendors/vendor-delivery.service';
import { CartService } from '../cart/cart.service';
import { EscrowService } from '../escrow/escrow.service';
import { ServiceSchedulingService } from '../escrow/service-scheduling.service';
import { WalletService } from '../wallet/wallet.service';
import { TimingPolicyService } from '../../common/services/timing-policy.service';
import {
  CheckoutDto,
  DirectCheckoutDto,
  MeetupSelectionDto,
  ServiceScheduleDto,
  VendorFulfillmentChoiceDto,
} from './dto/checkout.dto';

interface RawLine {
  cartItemId: string | null;
  /** Any kind — the listing's own `kind` decides the path. */
  listingId: string;
  offerId?: string | null;
  quantity: number;
  selectedOptionIds: string[];
}

/** Relations every line needs for validation, whatever its kind. */
const LINE_RELATIONS = [
  'vendorProfile',
  'optionGroups',
  'optionGroups.options',
];

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
  cartItemId: string | null;
  listing: Listing;
  /** The vendor's delivery preset for the buyer's campus (resolved once per vendor). */
  preset: CampusDeliveryPreset;
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

/** One service booking = one sub-order (rev-2 03.6, decision #1). */
interface ServicePlan {
  vendorProfileId: string;
  sellerId: string;
  businessName: string;
  line: VendorPlanLine;
  itemsSubtotalKobo: number;
  deliveryFeeKobo: number; // the travel fee, when the vendor comes to you
  deliveryMethod: DeliveryMethod;
  deliveryLocation: string;
  deliveryAddress: string | null;
  proposedTime: Date;
  scheduleNote: string | null;
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
 *   fulfillment is chosen once per sub-order (pickup / delivery) and priced
 *   from the vendor's per-campus delivery PRESET (2026-09-21 amendment to
 *   03.2): the door fee for an address, the chosen drop point's own fee
 *   otherwise. A `pickupOnly` line forces pickup for the whole sub-order, and
 *   neighboring-university delivery goes to one of the vendor's admin drop
 *   points only.
 * - Manual-confirmation vendor orders start PENDING_CONFIRMATION.
 * - Service lines (Phase 6, spec 03.6) each become their OWN sub-order with
 *   the buyer's proposed time; travel goes to a buyer-provided location
 *   (drop points don't apply — nothing is handed over at a gate).
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
    private vendorDelivery: VendorDeliveryService,
    private cartService: CartService,
    private escrowService: EscrowService,
    private schedulingService: ServiceSchedulingService,
    private walletService: WalletService,
    private timingPolicy: TimingPolicyService,
  ) { }

  async checkoutFromCart(user: User, dto: CheckoutDto): Promise<CheckoutResult> {
    const items = await this.cartService.getRawItems(user.id);
    if (items.length === 0) {
      throw new BadRequestException('Your cart is empty');
    }

    const rawLines: RawLine[] = items.map((item) => ({
      cartItemId: item.id,
      listingId: item.listingId,
      offerId: item.offerId,
      quantity: item.quantity,
      selectedOptionIds: this.cartService.lineOptionIds(item),
    }));

    const result = await this.execute(
      user,
      rawLines,
      dto.meetupSelections ?? [],
      dto.vendorFulfillment ?? [],
      dto.serviceSchedules ?? [],
      dto.notes ?? null,
      false,
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
          cartItemId: null,
          listingId: dto.listingId,
          offerId: dto.offerId ?? null,
          quantity: 1,
          selectedOptionIds: [],
        },
      ],
      [{ listingId: dto.listingId, meetupPointIndex: dto.meetupPointIndex }],
      [],
      [],
      dto.notes ?? null,
      true,
    );
  }

  // ─── the pipeline ───────────────────────────────────────────────

  private async execute(
    user: User,
    rawLines: RawLine[],
    selections: MeetupSelectionDto[],
    vendorChoices: VendorFulfillmentChoiceDto[],
    schedules: ServiceScheduleDto[],
    notes: string | null,
    p2pOnly: boolean,
  ): Promise<CheckoutResult> {
    // 1) Validate + reprice every line server-side; collect per-line issues.
    //    The listing's own kind routes the line — one table, three shapes.
    const issues: Array<{ listingId: string; reason: string }> = [];
    const p2pLines: P2pPlanLine[] = [];
    const vendorLines: VendorPlanLine[] = [];
    // Vendor delivery presets for the buyer's campus, resolved ONCE per vendor
    // per checkout (a mixed goods + service cart hits the DB once per shop).
    const presets = new Map<string, CampusDeliveryPreset | null>();

    for (const raw of rawLines) {
      const listing = await this.listingRepo.findOne({
        where: { id: raw.listingId },
        relations: LINE_RELATIONS,
      });
      if (!listing || listing.status !== ListingStatus.ACTIVE) {
        issues.push({ listingId: raw.listingId, reason: 'listing_unavailable' });
        continue;
      }
      if (listing.kind === ListingKind.P2P) {
        await this.validateP2pLine(user, raw, listing, issues, p2pLines);
      } else if (p2pOnly) {
        // Buy-now is a student-listing shortcut; shop items go through the
        // cart so fulfillment / schedule can be chosen.
        throw new BadRequestException(
          'Buy-now is for student listings — add shop items to your cart to check out',
        );
      } else {
        await this.validateVendorLine(
          user,
          raw,
          listing,
          issues,
          vendorLines,
          presets,
        );
      }
    }

    if (issues.length > 0) {
      throw new BadRequestException({
        message:
          'Some items can no longer be checked out. Review your cart and try again.',
        issues,
      });
    }

    // 2) Group into sub-order plans. Goods bundle per vendor; every service
    //    line is its OWN sub-order (own appointment, own deadline — 03.6).
    const goodsLines = vendorLines.filter(
      (line) => line.listing.kind !== ListingKind.VENDOR_SERVICE,
    );
    const serviceLines = vendorLines.filter(
      (line) => line.listing.kind === ListingKind.VENDOR_SERVICE,
    );

    const p2pPlans = this.buildP2pPlans(p2pLines, selections);
    const vendorPlans = this.buildVendorPlans(goodsLines, vendorChoices);
    const servicePlans = await this.buildServicePlans(serviceLines, schedules);

    const itemsSubtotalKobo =
      p2pPlans.reduce((sum, plan) => sum + plan.subtotalKobo, 0) +
      vendorPlans.reduce((sum, plan) => sum + plan.itemsSubtotalKobo, 0) +
      servicePlans.reduce((sum, plan) => sum + plan.itemsSubtotalKobo, 0);
    const deliveryTotalKobo =
      vendorPlans.reduce((sum, plan) => sum + plan.deliveryFeeKobo, 0) +
      servicePlans.reduce((sum, plan) => sum + plan.deliveryFeeKobo, 0);
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
    const itemCounts = new Map<string, number>();
    const serviceOrderPlans = new Map<string, ServicePlan>();

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
        itemCounts.set(order.id, plan.lines.length);
      }

      for (const plan of vendorPlans) {
        await this.decrementVendorStock(queryRunner, plan.lines);

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
              listingId: line.listing.id,
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
        itemCounts.set(order.id, plan.lines.length);
      }

      for (const plan of servicePlans) {
        // Services carry no base stock, but selected options can be tracked.
        await this.decrementVendorStock(queryRunner, [plan.line]);

        const order = await this.escrowService.createServiceSubOrder(
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
            notes,
            proposedTime: plan.proposedTime,
            scheduleNote: plan.scheduleNote,
            line: {
              listingId: plan.line.listing.id,
              title: plan.line.listing.title,
              unitPrice: toNaira(plan.line.unitPriceKobo),
              lineTotal: toNaira(plan.line.unitPriceKobo),
              optionsSnapshot: plan.line.optionsSnapshot,
            },
          },
        );
        orders.push(order);
        labels.set(order.id, plan.line.listing.title);
        itemCounts.set(order.id, 1);
        serviceOrderPlans.set(order.id, plan);
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
      const servicePlan = serviceOrderPlans.get(order.id);
      if (servicePlan) {
        await this.escrowService.finalizeServiceSubOrderPlacement(
          order,
          label,
          servicePlan.proposedTime,
        );
      } else if (order.market === 'vendor') {
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
        itemCount: itemCounts.get(order.id) ?? 1,
        deliveryMethod: order.deliveryMethod,
        deliveryLocation: order.deliveryLocation,
      })),
    };
  }

  // ─── line validation ────────────────────────────────────────────

  private async validateP2pLine(
    user: User,
    raw: RawLine,
    listing: Listing,
    issues: Array<{ listingId: string; reason: string }>,
    out: P2pPlanLine[],
  ): Promise<void> {
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
    listing: Listing,
    issues: Array<{ listingId: string; reason: string }>,
    out: VendorPlanLine[],
    presets: Map<string, CampusDeliveryPreset | null>,
  ): Promise<void> {
    const id = listing.id;
    if (
      !listing.vendorProfile ||
      listing.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      issues.push({ listingId: id, reason: 'listing_unavailable' });
      return;
    }
    if (listing.kind === ListingKind.VENDOR_SERVICE && raw.quantity !== 1) {
      issues.push({ listingId: id, reason: 'selection_invalid' });
      return;
    }
    if (listing.sellerId === user.id) {
      issues.push({ listingId: id, reason: 'own_listing' });
      return;
    }
    if (!user.universityId) {
      issues.push({ listingId: id, reason: 'vendor_not_serving' });
      return;
    }
    // The vendor's delivery preset for the buyer's campus doubles as the
    // served-university check (null = the vendor doesn't serve it).
    const vendorProfileId = listing.vendorProfileId as string;
    let preset = presets.get(vendorProfileId);
    if (preset === undefined) {
      preset = await this.vendorDelivery.resolveForCampus(
        vendorProfileId,
        user.universityId,
      );
      presets.set(vendorProfileId, preset);
    }
    if (!preset) {
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
      cartItemId: raw.cartItemId,
      listing,
      preset,
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

  private buildVendorPlans(
    lines: VendorPlanLine[],
    choices: VendorFulfillmentChoiceDto[],
  ): VendorPlan[] {
    const groups = new Map<string, VendorPlanLine[]>();
    for (const line of lines) {
      const key = line.listing.vendorProfileId as string;
      const group = groups.get(key) ?? [];
      group.push(line);
      groups.set(key, group);
    }

    const plans: VendorPlan[] = [];
    for (const [vendorProfileId, groupLines] of groups) {
      const profile = groupLines[0].listing.vendorProfile as VendorProfile;
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
        // The vendor's preset for the buyer's campus — same object on every
        // line of this vendor (resolved once in validateVendorLine).
        const preset = groupLines[0].preset;

        // 1. A pickupOnly line opts out of the preset and forces the whole
        //    sub-order to pickup — one trip, one method per vendor (03.2).
        const pickupOnlyLine = groupLines.find(
          (line) => line.listing.pickupOnly,
        );
        if (pickupOnlyLine) {
          throw new BadRequestException(
            `"${pickupOnlyLine.listing.title}" is pickup-only — choose pickup for ${profile.businessName}`,
          );
        }
        // 2. Nothing deliverable at this campus at all.
        if (preset.doorDeliveryFee === null && preset.dropPoints.length === 0) {
          throw new BadRequestException(
            `${profile.businessName} only offers pickup at your campus`,
          );
        }

        if (preset.isHome) {
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
          // Membership in the vendor's preset implies the point is active and
          // at the buyer's campus; the fee is that point's own.
          const point = preset.dropPoints.find(
            (candidate) => candidate.id === choice.dropPointId,
          );
          if (!point) {
            throw new BadRequestException(
              `Choose one of ${profile.businessName}'s drop points at your university`,
            );
          }
          dropPointId = point.id;
          deliveryLocation = `Drop point: ${point.name}`;
          deliveryFeeKobo = toKobo(point.fee);
        } else {
          if (preset.doorDeliveryFee === null) {
            throw new BadRequestException(
              `${profile.businessName} doesn't deliver to addresses on your campus — pick a drop point or pickup`,
            );
          }
          deliveryAddress = (choice.deliveryAddress as string).trim();
          deliveryLocation = deliveryAddress;
          deliveryFeeKobo = toKobo(preset.doorDeliveryFee);
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
          (line) => line.listing.manualConfirm,
        ),
      });
    }
    return plans;
  }

  /**
   * One plan per SERVICE line (rev-2 spec 03.6): the buyer's proposed time
   * (validated > now and ≤ 14 days out) plus where the service happens —
   * pickup at the shop, or "delivery" = the vendor travels to a
   * buyer-provided location (the vendor's per-campus travel fee from the
   * delivery preset; the goods drop-point rule doesn't apply).
   */
  private async buildServicePlans(
    lines: VendorPlanLine[],
    schedules: ServiceScheduleDto[],
  ): Promise<ServicePlan[]> {
    if (lines.length === 0) return [];

    const policy = this.timingPolicy.resolve({
      market: 'vendor',
      itemType: 'vendor_service',
    });
    const horizonMs = policy.appointmentHorizonDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const plans: ServicePlan[] = [];
    for (const line of lines) {
      const profile = line.listing.vendorProfile as VendorProfile;
      const title = line.listing.title;
      const schedule = (schedules ?? []).find(
        (s) => s.cartItemId === line.cartItemId,
      );
      if (!schedule) {
        throw new BadRequestException(
          `Provide a schedule (proposed time + pickup/travel choice) for "${title}"`,
        );
      }

      const proposedTime = new Date(schedule.proposedTime);
      if (Number.isNaN(proposedTime.getTime())) {
        throw new BadRequestException(
          `The proposed time for "${title}" is not a valid date`,
        );
      }
      if (proposedTime.getTime() <= now) {
        throw new BadRequestException(
          `The proposed time for "${title}" must be in the future`,
        );
      }
      if (proposedTime.getTime() > now + horizonMs) {
        throw new BadRequestException(
          `An appointment can sit at most ${policy.appointmentHorizonDays} days out — pick an earlier time for "${title}"`,
        );
      }

      // The calendar seam (spec 05): v1 always allows.
      await this.schedulingService.assertAvailable(
        line.listing.id,
        proposedTime,
      );

      let deliveryMethod: DeliveryMethod;
      let deliveryFeeKobo = 0;
      let deliveryLocation: string;
      let deliveryAddress: string | null = null;

      if (schedule.method === 'pickup') {
        // The buyer goes to the vendor.
        deliveryMethod = DeliveryMethod.PICKUP;
        deliveryLocation =
          profile.shopAddress?.trim() ||
          `${profile.businessName} (at the shop)`;
      } else {
        // Travel: the vendor comes to the buyer — the vendor's travel fee for
        // the buyer's campus (any served campus), unless this one service is
        // at-the-shop only.
        deliveryMethod = DeliveryMethod.DELIVERY;
        if (line.listing.pickupOnly || line.preset.serviceTravelFee === null) {
          throw new BadRequestException(
            `"${title}" doesn't offer travel to your university — choose pickup`,
          );
        }
        deliveryFeeKobo = toKobo(line.preset.serviceTravelFee);
        if (!schedule.serviceAddress?.trim()) {
          throw new BadRequestException(
            `Provide the service location for "${title}" (where should the vendor come?)`,
          );
        }
        deliveryAddress = schedule.serviceAddress.trim();
        deliveryLocation = deliveryAddress;
      }

      plans.push({
        vendorProfileId: profile.id,
        sellerId: profile.userId,
        businessName: profile.businessName,
        line,
        itemsSubtotalKobo: line.unitPriceKobo,
        deliveryFeeKobo,
        deliveryMethod,
        deliveryLocation,
        deliveryAddress,
        proposedTime,
        scheduleNote: schedule.note?.trim() || null,
      });
    }
    return plans;
  }

  // ─── stock reservation (race-checked, inside the checkout tx) ────

  private async decrementVendorStock(
    queryRunner: QueryRunner,
    lines: VendorPlanLine[],
  ): Promise<void> {
    for (const line of lines) {
      if (line.listing.stock !== null) {
        const rows: unknown[] = await queryRunner.manager.query(
          `UPDATE "listings" SET "stock" = "stock" - $1
           WHERE "id" = $2 AND "kind" = 'vendor_goods' AND "status" = 'active' AND "stock" >= $1
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
        const active = await queryRunner.manager.findOne(Listing, {
          where: { id: line.listing.id, status: ListingStatus.ACTIVE },
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
