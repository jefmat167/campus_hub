import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, QueryRunner } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomInt } from 'crypto';
import {
  EscrowTransaction,
  EscrowStatus,
  OrderMarket,
} from '../../database/entities/escrow.entity';
import {
  OrderItem,
  OrderItemType,
} from '../../database/entities/order-item.entity';
import {
  ServiceTimeProposal,
  ProposalParty,
  ProposalStatus,
} from '../../database/entities/service-time-proposal.entity';
import {
  Dispute,
  DisputeStatus,
} from '../../database/entities/dispute.entity';
import { DeliveryCode } from '../../database/entities/delivery-code.entity';
import {
  Listing,
  ListingStatus,
  DeliveryMethod,
} from '../../database/entities/listing.entity';
import { User, VerificationTier } from '../../database/entities/user.entity';
import {
  BuyRequestOffer,
} from '../../database/entities/buy-request-offer.entity';
import {
  BuyRequest,
  BuyRequestStatus,
} from '../../database/entities/buy-request.entity';
import { getAmountLimitForTier } from '../../common/guards/tier.guard';
import {
  splitFee,
  splitByPercent,
  percentOf,
  toKobo,
  toNaira,
} from '../../common/utils/money';
import { WalletService } from '../wallet/wallet.service';
import { PlatformWalletService } from '../wallet/platform-wallet.service';
import { PlatformTransactionType } from '../../database/entities/platform-wallet.entity';
import {
  OpenDisputeDto,
  ResolveDisputeDto,
  SellerReadyDto,
} from './dto';
import { AdminListEscrowDto } from './dto/admin-list-escrow.dto';
import {
  ESCROW_QUEUE_NAME,
  EscrowJobName,
} from './interfaces/escrow-jobs.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import { ResendService } from '../email/resend.service';
import { TimingPolicyService } from '../../common/services/timing-policy.service';
import { UniversitySettingsService } from '../universities/university-settings.service';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  // Hours after creation to nudge the seller while still AWAITING_SELLER.
  private readonly FULFILLMENT_REMINDER_HOURS = [24, 48];
  // Delivery-code verification lockout (anti-brute-force on the 4-digit code).
  private readonly DELIVERY_CODE_MAX_ATTEMPTS = 5;
  private readonly DELIVERY_CODE_LOCK_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    @InjectRepository(EscrowTransaction)
    private escrowRepo: Repository<EscrowTransaction>,
    @InjectRepository(Dispute)
    private disputeRepo: Repository<Dispute>,
    @InjectRepository(DeliveryCode)
    private deliveryCodeRepo: Repository<DeliveryCode>,
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    @InjectRepository(OrderItem)
    private orderItemRepo: Repository<OrderItem>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(BuyRequestOffer)
    private buyRequestOfferRepo: Repository<BuyRequestOffer>,
    @InjectRepository(BuyRequest)
    private buyRequestRepo: Repository<BuyRequest>,
    private walletService: WalletService,
    @Inject(forwardRef(() => PlatformWalletService))
    private platformWalletService: PlatformWalletService,
    private dataSource: DataSource,
    @InjectQueue(ESCROW_QUEUE_NAME)
    private escrowQueue: Queue,
    private notificationsService: NotificationsService,
    private resendService: ResendService,
    private timingPolicy: TimingPolicyService,
    private universitySettingsService: UniversitySettingsService,
  ) { }

  // Timing knobs resolved through the shared policy service (env-backed
  // today, per-category overrides later — rev-2 spec 05).
  private get FULFILLMENT_HOURS(): number {
    return this.timingPolicy.resolve().fulfillmentHours;
  }

  private get DISPUTE_WINDOW_MINUTES(): number {
    return this.timingPolicy.resolve().disputeWindowMinutes;
  }

  /**
   * Platform fee split for an order (rev-2 spec 01.3): the fee %, resolved
   * per the BUYER's university and the order's market, applies to the ITEMS
   * SUBTOTAL — delivery/travel fees pass through to the seller in full. The
   * seller payout is amount − fee, kobo-exact.
   */
  private async getOrderFeeSplit(escrow: EscrowTransaction): Promise<{
    platformFee: number;
    sellerPayout: number;
  }> {
    const buyer = await this.userRepo.findOne({
      where: { id: escrow.buyerId },
      select: ['id', 'universityId'],
    });
    const settings = await this.universitySettingsService.resolve(
      buyer?.universityId ?? null,
    );
    const percent =
      escrow.market === OrderMarket.VENDOR
        ? settings.vendorFeePercent
        : settings.p2pFeePercent;
    const feeBase = Number(escrow.itemsSubtotal ?? escrow.amount);
    const { fee: platformFee } = splitFee(feeBase, percent);
    const sellerPayout = toNaira(
      toKobo(Number(escrow.amount)) - toKobo(platformFee),
    );
    return { platformFee, sellerPayout };
  }

  /**
   * Schedule seller nudges while the order is AWAITING_SELLER. One delayed job
   * per offset that lands before the fulfillment window closes; each is
   * guarded at run time and removed on state change.
   */
  private async scheduleFulfillmentReminders(escrowId: string): Promise<void> {
    for (const hours of this.FULFILLMENT_REMINDER_HOURS) {
      if (hours >= this.FULFILLMENT_HOURS) continue; // don't remind after expiry
      await this.escrowQueue.add(
        EscrowJobName.SEND_FULFILLMENT_REMINDER,
        { escrowId, reminderNumber: hours },
        {
          delay: hours * 60 * 60 * 1000,
          jobId: `fulfillment-reminder-${escrowId}-${hours}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
    }
  }

  private async cancelFulfillmentReminders(escrowId: string): Promise<void> {
    for (const hours of this.FULFILLMENT_REMINDER_HOURS) {
      await this.escrowQueue.remove(`fulfillment-reminder-${escrowId}-${hours}`);
    }
  }

  /**
   * Notify the seller of a still-unfulfilled order (called by the reminder job).
   * No-op if the escrow has already left AWAITING_SELLER.
   */
  async sendFulfillmentReminder(
    escrowId: string,
    reminderNumber: number,
  ): Promise<void> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow || escrow.status !== EscrowStatus.AWAITING_SELLER) {
      return;
    }

    const seller = await this.userRepo.findOne({
      where: { id: escrow.sellerId },
    });

    // In-app + push. FULFILLMENT_REMINDER is non-mutable in the notifications
    // service, so this reaches the seller regardless of their mute settings.
    await this.notificationsService.createNotification({
      userId: escrow.sellerId,
      type: NotificationType.FULFILLMENT_REMINDER,
      title: 'Action needed: confirm your order',
      body: `Order ${escrow.orderNumber} is still awaiting your confirmation. Mark it ready before the ${this.FULFILLMENT_HOURS}h window closes, or it will be auto-cancelled.`,
      data: {
        escrowId: escrow.id,
        orderNumber: escrow.orderNumber,
        reminderHours: reminderNumber,
        ...(escrow.checkoutId && { checkoutId: escrow.checkoutId }),
        ...(escrow.buyRequestOfferId && {
          buyRequestOfferId: escrow.buyRequestOfferId,
        }),
      },
    });

    // Critical "confirm or lose the sale" email — intentionally NOT gated by
    // the user's emailEnabled preference.
    if (seller?.email) {
      await this.resendService.sendEmail({
        to: seller.email,
        subject: `Action needed: confirm order ${escrow.orderNumber}`,
        template: 'fulfillmentReminderSeller',
        context: {
          sellerName: seller.fullName,
          orderNumber: escrow.orderNumber,
          reminderHours: reminderNumber,
          fulfillmentHours: this.FULFILLMENT_HOURS,
        },
      });
    }

    this.logger.log(
      `Sent ${reminderNumber}h fulfillment reminder to seller ${escrow.sellerId} for escrow ${escrowId}`,
    );
  }

  /**
   * Generate human-readable order number (ORD-YYYY-NNNNNN)
   */
  private async generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const result = await this.dataSource.query(
      "SELECT nextval('order_number_seq') as seq",
    );
    const seq = result[0].seq;
    return `ORD-${year}-${String(seq).padStart(6, '0')}`;
  }

  /**
   * Delivery-code validity window, per method (rev-2: one strategy map for
   * every fulfillment kind): meet-up = ±2h around the scheduled date/time;
   * anything without a schedule (buy-request escrows today; vendor pickup /
   * door delivery from Phase 5) = open from now until the delivery deadline.
   */
  private computeCodeWindow(escrow: EscrowTransaction): {
    validFrom: Date;
    validUntil: Date;
  } {
    // Services (rev-2 03.6): the code exchanges at the appointment — it opens
    // 2h before it (meetup's lead-in mirrored) and stays valid until the
    // order deadline (appointment + 24h backstop).
    if (escrow.appointmentAt) {
      const appointment = new Date(escrow.appointmentAt);
      return {
        validFrom: new Date(appointment.getTime() - 2 * 60 * 60 * 1000),
        validUntil: escrow.fulfillmentExpiresAt,
      };
    }
    if (
      escrow.deliveryMethod === DeliveryMethod.MEETUP &&
      escrow.deliveryDate &&
      escrow.deliveryTime
    ) {
      const scheduledAt = new Date(escrow.deliveryDate);
      const [hours, minutes] = escrow.deliveryTime.split(':').map(Number);
      scheduledAt.setHours(hours, minutes, 0, 0);
      return {
        validFrom: new Date(scheduledAt.getTime() - 2 * 60 * 60 * 1000),
        validUntil: new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000),
      };
    }
    return {
      validFrom: new Date(),
      validUntil:
        escrow.fulfillmentExpiresAt ??
        new Date(Date.now() + this.FULFILLMENT_HOURS * 60 * 60 * 1000),
    };
  }

  /**
   * Generate 4-digit delivery code
   */
  private generateDeliveryCodeValue(): string {
    // Cryptographically secure (not Math.random). 4-digit, 1000–9999.
    return String(randomInt(1000, 10000));
  }

  /**
   * Create one P2P sub-order (rev-2 spec 01.6/03.4) on the CALLER's
   * transaction — one escrow row plus its order_items. The caller (checkout)
   * owns the listing flips, the single wallet lock on the checkout total, and
   * commit/rollback; call finalizeSubOrderPlacement() after commit.
   */
  async createP2pSubOrder(
    queryRunner: QueryRunner,
    params: {
      checkoutId: string;
      buyerId: string;
      sellerId: string;
      amount: number; // naira — must equal the sum of line totals
      deliveryLocation: string;
      notes?: string | null;
      lines: Array<{
        listingId: string;
        title: string;
        unitPrice: number; // naira
        offerId?: string | null;
      }>;
    },
  ): Promise<EscrowTransaction> {
    const orderNumber = await this.generateOrderNumber();
    const fulfillmentExpiresAt = new Date(
      Date.now() + this.FULFILLMENT_HOURS * 60 * 60 * 1000,
    );

    const escrow = this.escrowRepo.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      checkoutId: params.checkoutId,
      market: OrderMarket.P2P,
      amount: params.amount,
      itemsSubtotal: params.amount, // P2P sub-orders carry no delivery fee
      deliveryFee: 0,
      orderNumber,
      status: EscrowStatus.AWAITING_SELLER,
      fulfillmentExpiresAt,
      notes: params.notes ?? null,
      deliveryMethod: DeliveryMethod.MEETUP,
      deliveryLocation: params.deliveryLocation,
    });
    const savedEscrow = await queryRunner.manager.save(escrow);

    for (const line of params.lines) {
      await queryRunner.manager.save(
        queryRunner.manager.create(OrderItem, {
          orderId: savedEscrow.id,
          itemType: OrderItemType.P2P_LISTING,
          listingId: line.listingId,
          offerId: line.offerId ?? null,
          titleSnapshot: line.title,
          unitPrice: line.unitPrice,
          quantity: 1,
          lineTotal: line.unitPrice,
        }),
      );
    }

    return savedEscrow;
  }

  /**
   * Post-commit side effects for a freshly placed sub-order: the 72h delivery
   * deadline + seller reminders, buyer/seller notifications, and emails.
   * Never throws — the money has already moved; a lost notification must not
   * turn a successful checkout into a 500.
   */
  async finalizeSubOrderPlacement(
    escrow: EscrowTransaction,
    itemsLabel: string,
  ): Promise<void> {
    try {
      await this.escrowQueue.add(
        EscrowJobName.CHECK_FULFILLMENT_EXPIRY,
        { escrowId: escrow.id },
        {
          delay: this.FULFILLMENT_HOURS * 60 * 60 * 1000,
          jobId: `fulfillment-expiry-${escrow.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );
      await this.scheduleFulfillmentReminders(escrow.id);

      const amount = Number(escrow.amount);
      const formattedAmount = amount.toLocaleString();
      const [buyer, seller] = await Promise.all([
        this.userRepo.findOne({ where: { id: escrow.buyerId } }),
        this.userRepo.findOne({ where: { id: escrow.sellerId } }),
      ]);

      // Notify buyer — push + in-app
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ESCROW_INITIATED,
        title: 'Order confirmed',
        body: `Your order ${escrow.orderNumber} for "${itemsLabel}" (₦${formattedAmount}) has been placed. The seller has 72 hours to respond.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          checkoutId: escrow.checkoutId,
          amount,
        },
      });

      // Notify seller — push + in-app
      await this.notificationsService.createNotification({
        userId: escrow.sellerId,
        type: NotificationType.ESCROW_INITIATED,
        title: 'New order on your listing',
        body: `A buyer has placed an order (${escrow.orderNumber}) for ₦${formattedAmount} on "${itemsLabel}". You have 72 hours to respond.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          checkoutId: escrow.checkoutId,
          amount,
        },
      });

      if (buyer?.email) {
        await this.resendService.sendEmail({
          to: buyer.email,
          subject: `Order Confirmed — ${escrow.orderNumber}`,
          template: 'orderConfirmationBuyer',
          context: {
            buyerName: buyer.fullName,
            orderNumber: escrow.orderNumber,
            listingTitle: itemsLabel,
            amount: formattedAmount,
            sellerName: seller?.fullName ?? 'Seller',
          },
        });
      }

      if (seller?.email) {
        await this.resendService.sendEmail({
          to: seller.email,
          subject: `New Order — ${escrow.orderNumber}`,
          template: 'newOrderSeller',
          context: {
            sellerName: seller.fullName,
            orderNumber: escrow.orderNumber,
            listingTitle: itemsLabel,
            amount: formattedAmount,
          },
        });
      }

      this.logger.log(
        `Sub-order ${escrow.id} (${escrow.orderNumber}) placed for ₦${formattedAmount}`,
      );
    } catch (error) {
      this.logger.error(
        `Post-placement side effects failed for sub-order ${escrow.id}: ${error}`,
      );
    }
  }

  /**
   * Create one VENDOR sub-order (rev-2 spec 03.4/03.5) on the CALLER's
   * transaction. Manual-confirmation orders start in PENDING_CONFIRMATION
   * (funds already held); auto-confirmed orders go straight to
   * AWAITING_SELLER. Stock was already decremented by the checkout.
   */
  async createVendorSubOrder(
    queryRunner: QueryRunner,
    params: {
      checkoutId: string;
      buyerId: string;
      sellerId: string; // the vendor profile's userId
      amount: number; // naira — itemsSubtotal + deliveryFee
      itemsSubtotal: number;
      deliveryFee: number;
      deliveryMethod: DeliveryMethod;
      deliveryLocation: string;
      deliveryAddress?: string | null;
      dropPointId?: string | null;
      confirmationRequired: boolean;
      notes?: string | null;
      lines: Array<{
        vendorListingId: string;
        title: string;
        unitPrice: number;
        quantity: number;
        lineTotal: number;
        optionsSnapshot: Record<string, unknown> | null;
      }>;
    },
  ): Promise<EscrowTransaction> {
    const orderNumber = await this.generateOrderNumber();
    const fulfillmentExpiresAt = new Date(
      Date.now() + this.FULFILLMENT_HOURS * 60 * 60 * 1000,
    );

    const escrow = this.escrowRepo.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      checkoutId: params.checkoutId,
      market: OrderMarket.VENDOR,
      amount: params.amount,
      itemsSubtotal: params.itemsSubtotal,
      deliveryFee: params.deliveryFee,
      orderNumber,
      status: params.confirmationRequired
        ? EscrowStatus.PENDING_CONFIRMATION
        : EscrowStatus.AWAITING_SELLER,
      confirmationRequired: params.confirmationRequired,
      // Provisional for manual orders — reset to confirm-time + 72h on confirm.
      fulfillmentExpiresAt,
      notes: params.notes ?? null,
      deliveryMethod: params.deliveryMethod,
      deliveryLocation: params.deliveryLocation,
      deliveryAddress: params.deliveryAddress ?? null,
      dropPointId: params.dropPointId ?? null,
    });
    const savedEscrow = await queryRunner.manager.save(escrow);

    for (const line of params.lines) {
      await queryRunner.manager.save(
        queryRunner.manager.create(OrderItem, {
          orderId: savedEscrow.id,
          itemType: OrderItemType.VENDOR_GOODS,
          vendorListingId: line.vendorListingId,
          titleSnapshot: line.title,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
          optionsSnapshot: line.optionsSnapshot,
        }),
      );
    }

    return savedEscrow;
  }

  /**
   * Post-commit side effects for a vendor sub-order. Manual orders get the
   * 24h confirmation-timeout timer; auto-confirmed orders get the standard
   * 72h delivery deadline + reminders. Never throws.
   */
  async finalizeVendorSubOrderPlacement(
    escrow: EscrowTransaction,
    itemsLabel: string,
  ): Promise<void> {
    try {
      const confirmationHours = this.timingPolicy.resolve().confirmationHours;
      if (escrow.status === EscrowStatus.PENDING_CONFIRMATION) {
        await this.escrowQueue.add(
          EscrowJobName.ORDER_CONFIRM_TIMEOUT,
          { escrowId: escrow.id },
          {
            delay: confirmationHours * 60 * 60 * 1000,
            jobId: `confirm-timeout-${escrow.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 1000 },
          },
        );
      } else {
        await this.scheduleFulfillmentTimers(escrow.id);
      }

      const amount = Number(escrow.amount);
      const formattedAmount = amount.toLocaleString();
      const [buyer, seller] = await Promise.all([
        this.userRepo.findOne({ where: { id: escrow.buyerId } }),
        this.userRepo.findOne({ where: { id: escrow.sellerId } }),
      ]);

      const pending = escrow.status === EscrowStatus.PENDING_CONFIRMATION;
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ESCROW_INITIATED,
        title: pending ? 'Order placed — awaiting vendor confirmation' : 'Order confirmed',
        body: pending
          ? `Your order ${escrow.orderNumber} for "${itemsLabel}" (₦${formattedAmount}) is waiting for the vendor to confirm (within ${confirmationHours}h). You'll be refunded in full if they don't.`
          : `Your order ${escrow.orderNumber} for "${itemsLabel}" (₦${formattedAmount}) has been placed. The vendor has 72 hours to fulfil it.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          checkoutId: escrow.checkoutId,
          amount,
        },
      });

      await this.notificationsService.createNotification({
        userId: escrow.sellerId,
        type: NotificationType.ESCROW_INITIATED,
        title: pending
          ? `New order — confirm within ${confirmationHours}h`
          : 'New order on your storefront',
        body: pending
          ? `Order ${escrow.orderNumber} for "${itemsLabel}" (₦${formattedAmount}) needs your confirmation within ${confirmationHours} hours, or it auto-cancels with a full refund.`
          : `A buyer placed order ${escrow.orderNumber} for "${itemsLabel}" (₦${formattedAmount}). You have 72 hours to fulfil it.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          checkoutId: escrow.checkoutId,
          amount,
        },
      });

      if (buyer?.email) {
        await this.resendService.sendEmail({
          to: buyer.email,
          subject: `Order Confirmed — ${escrow.orderNumber}`,
          template: 'orderConfirmationBuyer',
          context: {
            buyerName: buyer.fullName,
            orderNumber: escrow.orderNumber,
            listingTitle: itemsLabel,
            amount: formattedAmount,
            sellerName: seller?.fullName ?? 'Vendor',
          },
        });
      }
      if (seller?.email) {
        await this.resendService.sendEmail({
          to: seller.email,
          subject: `New Order — ${escrow.orderNumber}`,
          template: 'newOrderSeller',
          context: {
            sellerName: seller.fullName,
            orderNumber: escrow.orderNumber,
            listingTitle: itemsLabel,
            amount: formattedAmount,
          },
        });
      }

      this.logger.log(
        `Vendor sub-order ${escrow.id} (${escrow.orderNumber}) placed for ₦${formattedAmount} (${escrow.status})`,
      );
    } catch (error) {
      this.logger.error(
        `Post-placement side effects failed for vendor sub-order ${escrow.id}: ${error}`,
      );
    }
  }

  /** Short date+time label for appointment copy (e.g. "Sep 2, 02:30 PM"). */
  private formatAppointment(date: Date): string {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /**
   * Create one SERVICE sub-order (rev-2 spec 03.6) on the CALLER's
   * transaction. A service never shares a sub-order with goods or another
   * service — it has its own appointment, ready-semantics, and deadline.
   * PENDING_CONFIRMATION here means TIME NEGOTIATION: the buyer's proposed
   * time lands as the first service_time_proposals row, and the provisional
   * deadline is the 72h agreement window (re-keyed to appointment + 24h once
   * a time is agreed).
   */
  async createServiceSubOrder(
    queryRunner: QueryRunner,
    params: {
      checkoutId: string;
      buyerId: string;
      sellerId: string; // the vendor profile's userId
      amount: number; // naira — itemsSubtotal + deliveryFee (travel)
      itemsSubtotal: number;
      deliveryFee: number;
      deliveryMethod: DeliveryMethod; // PICKUP (at the shop) or DELIVERY (travel)
      deliveryLocation: string;
      deliveryAddress?: string | null;
      notes?: string | null;
      proposedTime: Date;
      scheduleNote?: string | null;
      line: {
        vendorListingId: string;
        title: string;
        unitPrice: number;
        lineTotal: number;
        optionsSnapshot: Record<string, unknown> | null;
      };
    },
  ): Promise<EscrowTransaction> {
    const policy = this.timingPolicy.resolve({
      market: 'vendor',
      itemType: 'vendor_service',
    });
    const orderNumber = await this.generateOrderNumber();
    const now = Date.now();

    const escrow = this.escrowRepo.create({
      buyerId: params.buyerId,
      sellerId: params.sellerId,
      checkoutId: params.checkoutId,
      market: OrderMarket.VENDOR,
      amount: params.amount,
      itemsSubtotal: params.itemsSubtotal,
      deliveryFee: params.deliveryFee,
      orderNumber,
      status: EscrowStatus.PENDING_CONFIRMATION,
      confirmationRequired: true,
      // Provisional: the 72h time-to-AGREE window (spec FIG 03.5) — replaced
      // by appointment + 24h at agreement.
      fulfillmentExpiresAt: new Date(now + policy.agreementHours * 60 * 60 * 1000),
      notes: params.notes ?? null,
      deliveryMethod: params.deliveryMethod,
      deliveryLocation: params.deliveryLocation,
      deliveryAddress: params.deliveryAddress ?? null,
    });
    const savedEscrow = await queryRunner.manager.save(escrow);

    await queryRunner.manager.save(
      queryRunner.manager.create(OrderItem, {
        orderId: savedEscrow.id,
        itemType: OrderItemType.VENDOR_SERVICE,
        vendorListingId: params.line.vendorListingId,
        titleSnapshot: params.line.title,
        unitPrice: params.line.unitPrice,
        quantity: 1,
        lineTotal: params.line.lineTotal,
        optionsSnapshot: params.line.optionsSnapshot,
      }),
    );

    // The buyer's opening time proposal (48h on the table, offer semantics).
    await queryRunner.manager.save(
      queryRunner.manager.create(ServiceTimeProposal, {
        orderId: savedEscrow.id,
        proposedBy: ProposalParty.BUYER,
        proposedTime: params.proposedTime,
        message: params.scheduleNote ?? null,
        status: ProposalStatus.PENDING,
        expiresAt: new Date(now + policy.proposalExpiryHours * 60 * 60 * 1000),
      }),
    );

    return savedEscrow;
  }

  /**
   * Post-commit side effects for a service sub-order: the 72h agreement
   * timeout + both parties' notifications. Never throws.
   */
  async finalizeServiceSubOrderPlacement(
    escrow: EscrowTransaction,
    itemsLabel: string,
    proposedTime: Date,
  ): Promise<void> {
    try {
      const policy = this.timingPolicy.resolve({
        market: 'vendor',
        itemType: 'vendor_service',
      });
      await this.escrowQueue.add(
        EscrowJobName.SERVICE_AGREEMENT_TIMEOUT,
        { escrowId: escrow.id },
        {
          delay: policy.agreementHours * 60 * 60 * 1000,
          jobId: `agreement-timeout-${escrow.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );

      const amount = Number(escrow.amount);
      const formattedAmount = amount.toLocaleString();
      const timeLabel = this.formatAppointment(proposedTime);
      const [buyer, seller] = await Promise.all([
        this.userRepo.findOne({ where: { id: escrow.buyerId } }),
        this.userRepo.findOne({ where: { id: escrow.sellerId } }),
      ]);

      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ESCROW_INITIATED,
        title: 'Booking request placed',
        body: `Your booking ${escrow.orderNumber} for "${itemsLabel}" (₦${formattedAmount}) proposes ${timeLabel}. If no time is agreed within ${policy.agreementHours} hours you'll be refunded in full.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          checkoutId: escrow.checkoutId,
          amount,
          proposedTime: proposedTime.toISOString(),
        },
      });

      await this.notificationsService.createNotification({
        userId: escrow.sellerId,
        type: NotificationType.APPOINTMENT_PROPOSED,
        title: 'New booking request',
        body: `Booking ${escrow.orderNumber} for "${itemsLabel}" (₦${formattedAmount}) proposes ${timeLabel}. Accept, counter, or reject — proposals expire after ${policy.proposalExpiryHours}h, and the whole booking auto-cancels if no time is agreed within ${policy.agreementHours}h.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          checkoutId: escrow.checkoutId,
          amount,
          proposedTime: proposedTime.toISOString(),
        },
      });

      if (buyer?.email) {
        await this.resendService.sendEmail({
          to: buyer.email,
          subject: `Booking Request Placed — ${escrow.orderNumber}`,
          template: 'orderConfirmationBuyer',
          context: {
            buyerName: buyer.fullName,
            orderNumber: escrow.orderNumber,
            listingTitle: itemsLabel,
            amount: formattedAmount,
            sellerName: seller?.fullName ?? 'Vendor',
          },
        });
      }
      if (seller?.email) {
        await this.resendService.sendEmail({
          to: seller.email,
          subject: `New Booking Request — ${escrow.orderNumber}`,
          template: 'newOrderSeller',
          context: {
            sellerName: seller.fullName,
            orderNumber: escrow.orderNumber,
            listingTitle: itemsLabel,
            amount: formattedAmount,
          },
        });
      }

      this.logger.log(
        `Service sub-order ${escrow.id} (${escrow.orderNumber}) placed for ₦${formattedAmount}, proposing ${timeLabel}`,
      );
    } catch (error) {
      this.logger.error(
        `Post-placement side effects failed for service sub-order ${escrow.id}: ${error}`,
      );
    }
  }

  /**
   * An accepted time proposal becomes the appointment (rev-2 03.6): the order
   * is now "ready" — SELLER_READY with the delivery code issued (window:
   * appointment − 2h → deadline), and every deadline re-keys to the
   * appointment (deadline = appointment + 24h backstop). Called by
   * ServiceSchedulingService after party/proposal checks.
   */
  async activateServiceAppointment(
    escrowId: string,
    appointmentAt: Date,
  ): Promise<{ escrow: EscrowTransaction; deliveryCode: DeliveryCode }> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Order not found');
    if (escrow.status !== EscrowStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException(
        `Cannot agree a time. Order status is: ${escrow.status}`,
      );
    }

    const policy = this.timingPolicy.resolve({
      market: 'vendor',
      itemType: 'vendor_service',
    });
    const deadline = new Date(
      appointmentAt.getTime() + policy.appointmentBackstopHours * 60 * 60 * 1000,
    );

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let deliveryCode: DeliveryCode;
    try {
      const now = new Date();
      escrow.status = EscrowStatus.SELLER_READY;
      escrow.agreedAt = now;
      escrow.appointmentAt = appointmentAt;
      escrow.sellerReadyAt = now; // "ready" = the time is agreed (spec FIG 03.4)
      escrow.fulfillmentExpiresAt = deadline; // re-keyed: appointment + 24h
      await queryRunner.manager.save(escrow);

      deliveryCode = this.deliveryCodeRepo.create({
        escrowId: escrow.id,
        code: this.generateDeliveryCodeValue(),
        validFrom: new Date(appointmentAt.getTime() - 2 * 60 * 60 * 1000),
        validUntil: deadline,
      });
      await queryRunner.manager.save(deliveryCode);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.escrowQueue.remove(`agreement-timeout-${escrow.id}`);
    await this.escrowQueue.add(
      EscrowJobName.APPOINTMENT_BACKSTOP,
      { escrowId: escrow.id },
      {
        delay: Math.max(deadline.getTime() - Date.now(), 0),
        jobId: `appointment-backstop-${escrow.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    const itemTitle = await this.getItemTitle(escrow);
    const timeLabel = this.formatAppointment(appointmentAt);
    try {
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.APPOINTMENT_AGREED,
        title: 'Appointment agreed',
        body: `"${itemTitle}" (${escrow.orderNumber}) is booked for ${timeLabel}. Your delivery code is ${deliveryCode.code} — share it once the service is done. From 30 minutes past the appointment you can claim a full refund if the vendor doesn't show.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          appointmentAt: appointmentAt.toISOString(),
          deliveryCode: deliveryCode.code,
        },
      });
      await this.notificationsService.createNotification({
        userId: escrow.sellerId,
        type: NotificationType.APPOINTMENT_AGREED,
        title: 'Appointment agreed',
        body: `"${itemTitle}" (${escrow.orderNumber}) is booked for ${timeLabel}. Collect the buyer's 4-digit code at the appointment; the order auto-cancels with a full refund if it isn't confirmed within ${policy.appointmentBackstopHours}h after the appointment.`,
        data: {
          escrowId: escrow.id,
          orderNumber: escrow.orderNumber,
          appointmentAt: appointmentAt.toISOString(),
        },
      });

      const buyer = await this.userRepo.findOne({
        where: { id: escrow.buyerId },
      });
      if (buyer?.email) {
        await this.resendService.sendEmail({
          to: buyer.email,
          subject: `Appointment Confirmed — ${escrow.orderNumber}`,
          template: 'deliveryDetailsBuyer',
          context: {
            buyerName: buyer.fullName,
            orderNumber: escrow.orderNumber,
            deliveryCode: deliveryCode.code,
            deliveryMethod: escrow.deliveryMethod,
            deliveryDate: timeLabel,
            deliveryTime: '',
            deliveryLocation: escrow.deliveryLocation ?? '',
          },
        });
      }
    } catch (error) {
      this.logger.warn(
        `Appointment-agreed side effects failed for ${escrow.id}: ${error}`,
      );
    }

    this.logger.log(
      `Service order ${escrow.id} appointment agreed for ${timeLabel} (deadline ${deadline.toISOString()})`,
    );
    return { escrow, deliveryCode };
  }

  /**
   * Agreement-timeout backstop (72h, TimingPolicy — spec FIG 03.5): no
   * appointment agreed → auto-cancel with a full refund. The 3-day rule
   * polices negotiation for services, not delivery.
   */
  async handleAgreementTimeout(escrowId: string): Promise<void> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) {
      this.logger.warn(`Escrow ${escrowId} not found for agreement timeout`);
      return;
    }
    if (escrow.status !== EscrowStatus.PENDING_CONFIRMATION) {
      this.logger.log(
        `Escrow ${escrowId} status is ${escrow.status}, skipping agreement timeout`,
      );
      return;
    }

    await this.terminatePendingOrder(escrow, 'system', 'agreement_timeout');

    try {
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ORDER_REJECTED,
        title: 'Booking auto-cancelled — full refund issued',
        body: `No appointment time was agreed for booking ${escrow.orderNumber} in time, so it was cancelled and you've been refunded in full.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
      await this.notificationsService.createNotification({
        userId: escrow.sellerId,
        type: NotificationType.ORDER_EXPIRED,
        title: 'Booking lapsed',
        body: `Booking ${escrow.orderNumber} was auto-cancelled — no appointment time was agreed in time. The buyer was refunded in full.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
    } catch (error) {
      this.logger.warn(
        `Agreement-timeout notification failed for ${escrowId}: ${error}`,
      );
    }

    this.logger.log(`Service order ${escrowId} auto-cancelled (agreement timeout)`);
  }

  /**
   * Appointment backstop (appointment + 24h, spec 03.6): the service was
   * never confirmed as delivered — auto-cancel with a full refund. The
   * neutral safety net when neither side acts.
   */
  async handleAppointmentBackstop(escrowId: string): Promise<void> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) {
      this.logger.warn(`Escrow ${escrowId} not found for appointment backstop`);
      return;
    }
    if (escrow.status !== EscrowStatus.SELLER_READY) {
      this.logger.log(
        `Escrow ${escrowId} status is ${escrow.status}, skipping appointment backstop`,
      );
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.walletService.refundFunds(
        escrow.buyerId,
        Number(escrow.amount),
        `ESCROW_EXPIRED_${escrow.id}`,
        queryRunner,
        escrow.market ?? null,
      );

      escrow.status = EscrowStatus.EXPIRED;
      escrow.cancelledBy = 'system';
      escrow.cancelReason = 'appointment_backstop';
      escrow.refundedAt = new Date();
      await queryRunner.manager.save(escrow);

      await this.restoreVendorStock(queryRunner.manager, escrow.id);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    try {
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ORDER_EXPIRED,
        title: 'Booking expired — full refund issued',
        body: `Booking ${escrow.orderNumber} wasn't confirmed as delivered within 24 hours of the appointment, so it was cancelled and you've been refunded in full.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
      await this.notificationsService.createNotification({
        userId: escrow.sellerId,
        type: NotificationType.ORDER_EXPIRED,
        title: 'Booking expired',
        body: `Booking ${escrow.orderNumber} wasn't confirmed as delivered within 24 hours of the appointment. It was cancelled and the buyer refunded in full.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
    } catch (error) {
      this.logger.warn(
        `Backstop notification failed for ${escrowId}: ${error}`,
      );
    }

    this.logger.log(
      `Service order ${escrowId} expired (appointment backstop), full refund issued`,
    );
  }

  /**
   * Vendor no-show claim (rev-2 03.6): from 30 minutes past the appointment,
   * the buyer gets an immediate full refund — no dispute, no waiting for the
   * 24h backstop.
   */
  async claimNoShow(
    escrowId: string,
    buyerId: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Order not found');
    if (escrow.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can claim a no-show');
    }
    if (escrow.status !== EscrowStatus.SELLER_READY) {
      throw new BadRequestException(
        `Cannot claim a no-show. Order status is: ${escrow.status}`,
      );
    }
    if (!escrow.appointmentAt) {
      throw new BadRequestException(
        'No-show claims apply to service orders with an agreed appointment',
      );
    }

    const policy = this.timingPolicy.resolve({
      market: 'vendor',
      itemType: 'vendor_service',
    });
    const graceEndsAt = new Date(
      new Date(escrow.appointmentAt).getTime() +
        policy.noShowGraceMinutes * 60 * 1000,
    );
    if (new Date() < graceEndsAt) {
      throw new BadRequestException(
        `The ${policy.noShowGraceMinutes}-minute grace period is still running — you can claim from ${this.formatAppointment(graceEndsAt)}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.walletService.refundFunds(
        escrow.buyerId,
        Number(escrow.amount),
        `ESCROW_NO_SHOW_${escrow.id}`,
        queryRunner,
        escrow.market ?? null,
      );

      escrow.status = EscrowStatus.CANCELLED;
      escrow.cancelledBy = 'buyer';
      escrow.cancelReason = 'no_show';
      escrow.refundedAt = new Date();
      await queryRunner.manager.save(escrow);

      await this.restoreVendorStock(queryRunner.manager, escrow.id);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.escrowQueue.remove(`appointment-backstop-${escrowId}`);

    try {
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.NO_SHOW_REFUND,
        title: 'No-show refund issued',
        body: `You've been refunded ₦${Number(escrow.amount).toLocaleString()} in full for booking ${escrow.orderNumber} — the vendor didn't show.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
      await this.notificationsService.createNotification({
        userId: escrow.sellerId,
        type: NotificationType.NO_SHOW_REFUND,
        title: 'Buyer reported a no-show',
        body: `The buyer reported a no-show on booking ${escrow.orderNumber} and was refunded in full. Repeated no-shows affect your storefront standing.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
    } catch (error) {
      this.logger.warn(`No-show notification failed for ${escrowId}: ${error}`);
    }

    this.logger.log(`Service order ${escrowId} refunded on buyer no-show claim`);
    return escrow;
  }

  /**
   * Vendor confirms a PENDING_CONFIRMATION order (rev-2 03.5): the standard
   * 3-day fulfillment clock starts NOW (confirmation is commitment, not
   * readiness — the vendor still marks ready/out-for-delivery later).
   */
  async confirmOrder(
    escrowId: string,
    sellerId: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Order not found');
    if (escrow.sellerId !== sellerId) {
      throw new ForbiddenException('You are not the seller of this order');
    }
    if (escrow.status !== EscrowStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException(
        `Cannot confirm. Order status is: ${escrow.status}`,
      );
    }
    // Services never take the goods confirm path — their "confirmation" IS
    // the time negotiation (rev-2 03.6): accept a proposal instead.
    const serviceItem = await this.orderItemRepo.findOne({
      where: { orderId: escrowId, itemType: OrderItemType.VENDOR_SERVICE },
    });
    if (serviceItem) {
      throw new BadRequestException(
        'Service bookings are agreed through time proposals — respond to the proposed time instead',
      );
    }

    escrow.status = EscrowStatus.AWAITING_SELLER;
    escrow.confirmedAt = new Date();
    escrow.fulfillmentExpiresAt = new Date(
      Date.now() + this.FULFILLMENT_HOURS * 60 * 60 * 1000,
    );
    await this.escrowRepo.save(escrow);

    await this.escrowQueue.remove(`confirm-timeout-${escrowId}`);
    await this.scheduleFulfillmentTimers(escrowId);

    const itemTitle = await this.getItemTitle(escrow);
    try {
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ORDER_CONFIRMED,
        title: 'Vendor confirmed your order',
        body: `Order ${escrow.orderNumber} ("${itemTitle}") is confirmed. The vendor has 72 hours to fulfil it.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
    } catch (error) {
      this.logger.warn(`Confirm notification failed for ${escrowId}: ${error}`);
    }

    this.logger.log(`Order ${escrowId} confirmed by vendor ${sellerId}`);
    return escrow;
  }

  /**
   * Vendor rejects a PENDING_CONFIRMATION order: full refund, no fee
   * (seller-initiated — rev-2 01.2), stock restored.
   */
  async rejectOrder(
    escrowId: string,
    sellerId: string,
    reason?: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) throw new NotFoundException('Order not found');
    if (escrow.sellerId !== sellerId) {
      throw new ForbiddenException('You are not the seller of this order');
    }
    if (escrow.status !== EscrowStatus.PENDING_CONFIRMATION) {
      throw new BadRequestException(
        `Cannot reject. Order status is: ${escrow.status}`,
      );
    }

    await this.terminatePendingOrder(escrow, 'seller', 'rejected', reason);

    try {
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ORDER_REJECTED,
        title: 'Order rejected — full refund issued',
        body: `The vendor rejected order ${escrow.orderNumber}${reason ? ` ("${reason}")` : ''}. You've been refunded in full.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
    } catch (error) {
      this.logger.warn(`Reject notification failed for ${escrowId}: ${error}`);
    }

    this.logger.log(`Order ${escrowId} rejected by vendor ${sellerId}`);
    return escrow;
  }

  /**
   * Confirmation-timeout backstop (24h, TimingPolicy): the vendor never
   * confirmed — auto-cancel with a full refund + stock restore.
   */
  async handleConfirmationTimeout(escrowId: string): Promise<void> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });
    if (!escrow) {
      this.logger.warn(`Escrow ${escrowId} not found for confirmation timeout`);
      return;
    }
    if (escrow.status !== EscrowStatus.PENDING_CONFIRMATION) {
      this.logger.log(
        `Escrow ${escrowId} status is ${escrow.status}, skipping confirmation timeout`,
      );
      return;
    }

    await this.terminatePendingOrder(escrow, 'system', 'confirm_timeout');

    try {
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.ORDER_REJECTED,
        title: 'Order auto-cancelled — full refund issued',
        body: `The vendor didn't confirm order ${escrow.orderNumber} in time, so it was cancelled and you've been refunded in full.`,
        data: { escrowId, orderNumber: escrow.orderNumber },
      });
    } catch (error) {
      this.logger.warn(`Timeout notification failed for ${escrowId}: ${error}`);
    }

    this.logger.log(`Order ${escrowId} auto-cancelled (confirmation timeout)`);
  }

  /** Shared terminal path for pending vendor orders: refund + restock + cancel. */
  private async terminatePendingOrder(
    escrow: EscrowTransaction,
    cancelledBy: 'seller' | 'system',
    cancelReason: string,
    noteReason?: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await this.walletService.refundFunds(
        escrow.buyerId,
        Number(escrow.amount),
        `ESCROW_REJECTED_${escrow.id}`,
        queryRunner,
        escrow.market ?? null,
      );

      escrow.status = EscrowStatus.CANCELLED;
      escrow.cancelledBy = cancelledBy;
      escrow.cancelReason = cancelReason;
      escrow.refundedAt = new Date();
      if (noteReason) {
        escrow.metadata = { ...(escrow.metadata ?? {}), rejectionReason: noteReason };
      }
      await queryRunner.manager.save(escrow);

      await this.restoreVendorStock(queryRunner.manager, escrow.id);

      // Close out any open time proposal (service orders only; no-op for goods).
      await queryRunner.manager.update(
        ServiceTimeProposal,
        { orderId: escrow.id, status: ProposalStatus.PENDING },
        { status: ProposalStatus.EXPIRED },
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
    await this.escrowQueue.remove(`confirm-timeout-${escrow.id}`);
    await this.escrowQueue.remove(`agreement-timeout-${escrow.id}`);
  }

  /**
   * Put vendor stock back for a terminal-without-delivery order (reject,
   * confirmation timeout, cancel, expiry). Only tracked stock is touched —
   * if the vendor untracked it mid-flight, there's nothing to restore.
   * Disputes after delivery never restock: the goods are with the buyer.
   */
  private async restoreVendorStock(
    manager: import('typeorm').EntityManager,
    orderId: string,
  ): Promise<void> {
    const items = await manager.find(OrderItem, { where: { orderId } });
    for (const item of items) {
      if (!item.vendorListingId) continue;
      await manager.query(
        `UPDATE "vendor_listings" SET "stock" = "stock" + $1 WHERE "id" = $2 AND "stock" IS NOT NULL`,
        [item.quantity, item.vendorListingId],
      );
      const optionIds = Array.isArray(
        (item.optionsSnapshot as Record<string, unknown>)?.optionIds,
      )
        ? ((item.optionsSnapshot as Record<string, unknown>)
          .optionIds as string[])
        : [];
      for (const optionId of optionIds) {
        await manager.query(
          `UPDATE "options" SET "stock" = "stock" + $1 WHERE "id" = $2 AND "stock" IS NOT NULL`,
          [item.quantity, optionId],
        );
      }
    }
  }

  /** 72h delivery deadline + pre-ready seller reminders. */
  private async scheduleFulfillmentTimers(escrowId: string): Promise<void> {
    await this.escrowQueue.add(
      EscrowJobName.CHECK_FULFILLMENT_EXPIRY,
      { escrowId },
      {
        delay: this.FULFILLMENT_HOURS * 60 * 60 * 1000,
        jobId: `fulfillment-expiry-${escrowId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
    await this.scheduleFulfillmentReminders(escrowId);
  }

  /**
   * Resolve the display title for an order (buy-request title, or the first
   * order item's snapshot with a "+N more" suffix for bundles).
   */
  private async getItemTitle(escrow: EscrowTransaction): Promise<string> {
    if (escrow.buyRequestOfferId) {
      const offer = await this.buyRequestOfferRepo.findOne({
        where: { id: escrow.buyRequestOfferId },
        relations: ['buyRequest'],
      });
      return offer?.buyRequest?.title ?? 'Buy request item';
    }
    const items = await this.orderItemRepo.find({
      where: { orderId: escrow.id },
      order: { createdAt: 'ASC' },
    });
    if (items.length === 0) return 'Unknown item';
    return items.length === 1
      ? items[0].titleSnapshot
      : `${items[0].titleSnapshot} + ${items.length - 1} more`;
  }

  /**
   * Initiate escrow from an accepted buy request offer.
   * Called within the offer acceptance transaction via a shared QueryRunner.
   */
  async initiateEscrowFromOffer(buyerId: string, offer: BuyRequestOffer, queryRunner: import('typeorm').QueryRunner,): Promise<EscrowTransaction> {
    // Safety check
    if (offer.requesterId !== buyerId) {
      throw new BadRequestException('Buyer does not match the requester of this offer');
    }

    const sellerId = offer.responderId;
    const amount = Number(offer.proposedPrice);

    // Programmatic tier amount limit check
    const buyer = await this.userRepo.findOne({ where: { id: buyerId } });
    if (!buyer) {
      throw new NotFoundException('Buyer not found');
    }

    const buyerTier = buyer.verificationTier || VerificationTier.NONE;
    const amountLimit = getAmountLimitForTier(buyerTier, 'buying');

    if (amountLimit !== null && amount > amountLimit) {
      throw new ForbiddenException({
        message: `Amount exceeds your tier limit. Maximum allowed: ₦${amountLimit.toLocaleString()}`,
        limit: amountLimit,
        amount,
        currentTier: buyerTier,
        upgradeRequired: true,
      });
    }

    // Check wallet balance
    const balance = await this.walletService.getBalance(buyerId);
    if (balance.availableBalance < amount) {
      throw new BadRequestException(
        `Insufficient balance. You need ₦${amount.toLocaleString()}`,
      );
    }

    const orderNumber = await this.generateOrderNumber();
    const fulfillmentExpiresAt = new Date(
      Date.now() + this.FULFILLMENT_HOURS * 60 * 60 * 1000,
    );

    // Create escrow — linked to the buy request offer (no checkout/items)
    const escrow = this.escrowRepo.create({
      buyerId,
      sellerId,
      buyRequestOfferId: offer.id,
      market: OrderMarket.P2P,
      amount,
      orderNumber,
      status: EscrowStatus.AWAITING_SELLER,
      fulfillmentExpiresAt,
    });

    const savedEscrow = await queryRunner.manager.save(escrow);

    // Lock buyer's funds
    await this.walletService.lockFunds(buyerId, amount, `ESCROW_${savedEscrow.id}`, queryRunner);

    // No listing to update — buy request status is handled by the caller

    // Schedule 72h fulfillment expiry job (outside transaction is fine)
    await this.escrowQueue.add(
      EscrowJobName.CHECK_FULFILLMENT_EXPIRY,
      { escrowId: savedEscrow.id },
      {
        delay: this.FULFILLMENT_HOURS * 60 * 60 * 1000,
        jobId: `fulfillment-expiry-${savedEscrow.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );

    await this.scheduleFulfillmentReminders(savedEscrow.id);

    this.logger.log(
      `Escrow ${savedEscrow.id} (${orderNumber}) initiated from buy request offer ${offer.id} for ₦${amount}`,
    );

    // Fetch seller for notifications/emails
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    const itemTitle = offer.buyRequest?.title ?? 'Buy request item';
    const formattedAmount = amount.toLocaleString();

    // Notify buyer
    await this.notificationsService.createNotification({
      userId: buyerId,
      type: NotificationType.ESCROW_INITIATED,
      title: 'Order confirmed',
      body: `Your order ${orderNumber} for "${itemTitle}" (₦${formattedAmount}) has been placed. The seller has 72 hours to set delivery details.`,
      data: {
        escrowId: savedEscrow.id,
        orderNumber,
        buyRequestOfferId: offer.id,
        amount,
      },
    });

    // Notify seller — tailored copy for buy request offers
    await this.notificationsService.createNotification({
      userId: sellerId,
      type: NotificationType.ESCROW_INITIATED,
      title: 'Your offer was accepted!',
      body: `Your offer on "${itemTitle}" (₦${formattedAmount}) was accepted (${orderNumber}). You have 72 hours to set delivery details.`,
      data: {
        escrowId: savedEscrow.id,
        orderNumber,
        buyRequestOfferId: offer.id,
        amount,
      },
    });

    // Send order confirmation email to buyer
    if (buyer.email) {
      await this.resendService.sendEmail({
        to: buyer.email,
        subject: `Order Confirmed — ${orderNumber}`,
        template: 'orderConfirmationBuyer',
        context: {
          buyerName: buyer.fullName,
          orderNumber,
          listingTitle: itemTitle,
          amount: formattedAmount,
          sellerName: seller?.fullName ?? 'Seller',
        },
      });
    }

    // Send new order email to seller
    if (seller?.email) {
      await this.resendService.sendEmail({
        to: seller.email,
        subject: `Offer Accepted — ${orderNumber}`,
        template: 'newOrderSeller',
        context: {
          sellerName: seller.fullName,
          orderNumber,
          listingTitle: itemTitle,
          amount: formattedAmount,
        },
      });
    }

    return savedEscrow;
  }

  /**
   * Seller marks ready and sets delivery details
   * Generates delivery code for buyer
   */
  async sellerReady(escrowId: string, sellerId: string, dto: SellerReadyDto): Promise<{ escrow: EscrowTransaction; deliveryCode: DeliveryCode }> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    if (escrow.sellerId !== sellerId) {
      throw new ForbiddenException('You are not the seller of this transaction');
    }

    if (escrow.status !== EscrowStatus.AWAITING_SELLER) {
      throw new BadRequestException(`Cannot mark ready. Order status is: ${escrow.status}`);
    }

    const isMeetup = escrow.deliveryMethod === DeliveryMethod.MEETUP;

    // Code validity window depends on the method:
    //  - meet-up: ±2h around the seller's scheduled date/time (which must fall
    //    inside the 72h delivery deadline)
    //  - pick-up: open from now until the delivery deadline (collect any time)
    let validFrom: Date;
    let validUntil: Date;
    let scheduledAt: Date | null = null;

    if (isMeetup) {
      if (!dto.deliveryDate || !dto.deliveryTime) {
        throw new BadRequestException(
          'Delivery date and time are required for meet-up delivery',
        );
      }
      scheduledAt = new Date(dto.deliveryDate);
      const [hours, minutes] = dto.deliveryTime.split(':').map(Number);
      scheduledAt.setHours(hours, minutes, 0, 0);

      if (scheduledAt <= new Date()) {
        throw new BadRequestException('Delivery time must be in the future');
      }
      if (
        escrow.fulfillmentExpiresAt &&
        scheduledAt > escrow.fulfillmentExpiresAt
      ) {
        throw new BadRequestException(
          'Delivery must be scheduled within the 72-hour delivery window',
        );
      }
      validFrom = new Date(scheduledAt.getTime() - 2 * 60 * 60 * 1000);
      validUntil = new Date(scheduledAt.getTime() + 2 * 60 * 60 * 1000);
    } else {
      validFrom = new Date();
      validUntil =
        escrow.fulfillmentExpiresAt ??
        new Date(Date.now() + this.FULFILLMENT_HOURS * 60 * 60 * 1000);
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update escrow
      escrow.status = EscrowStatus.SELLER_READY;
      escrow.sellerReadyAt = new Date();
      if (isMeetup) {
        escrow.deliveryDate = new Date(dto.deliveryDate!);
        escrow.deliveryTime = dto.deliveryTime!;
      }
      // deliveryLocation was snapshotted at order time — leave it as-is.

      await queryRunner.manager.save(escrow);

      // Generate delivery code
      const deliveryCode = this.deliveryCodeRepo.create({
        escrowId,
        code: this.generateDeliveryCodeValue(),
        validFrom,
        validUntil,
      });

      await queryRunner.manager.save(deliveryCode);

      // Keep the fulfillment-expiry job running — it now enforces the 72h
      // *delivery* deadline through SELLER_READY (auto-refund if undelivered).
      // Only the pre-ready "confirm your order" reminders are cancelled.
      await this.cancelFulfillmentReminders(escrowId);

      await queryRunner.commitTransaction();

      this.logger.log(`Seller ready for escrow ${escrowId}, delivery scheduled for ${dto.deliveryDate} ${dto.deliveryTime}`);

      const location = escrow.deliveryLocation;
      const formattedDeliveryDate = scheduledAt
        ? scheduledAt.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : null;

      // Method-appropriate body: meet-up includes the scheduled date/time;
      // door delivery is out-for-delivery; pick-up is collect-any-time.
      const isDelivery = escrow.deliveryMethod === DeliveryMethod.DELIVERY;
      const body = isMeetup
        ? `The seller is ready for order ${escrow.orderNumber}. Your delivery code is ${deliveryCode.code}. Meet-up scheduled for ${formattedDeliveryDate} at ${dto.deliveryTime}, at ${location}.`
        : isDelivery
          ? `Order ${escrow.orderNumber} is out for delivery to ${location}. Your delivery code is ${deliveryCode.code} — share it with the courier on receipt.`
          : `The seller is ready for order ${escrow.orderNumber}. Your delivery code is ${deliveryCode.code}. Collect your item at ${location} and share the code with the seller.`;

      // Notify buyer — push + in-app
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.DELIVERY_CODE_SENT,
        title: 'Your delivery code is ready',
        body,
        data: {
          escrowId,
          orderNumber: escrow.orderNumber,
          deliveryCode: deliveryCode.code,
          deliveryMethod: escrow.deliveryMethod,
          deliveryDate: formattedDeliveryDate,
          deliveryTime: dto.deliveryTime ?? null,
          deliveryLocation: location,
        },
      });

      // Send delivery details email to buyer
      const buyer = await this.userRepo.findOne({ where: { id: escrow.buyerId } });
      if (buyer?.email) {
        await this.resendService.sendEmail({
          to: buyer.email,
          subject: `Delivery Scheduled — ${escrow.orderNumber}`,
          template: 'deliveryDetailsBuyer',
          context: {
            buyerName: buyer.fullName,
            orderNumber: escrow.orderNumber,
            deliveryCode: deliveryCode.code,
            deliveryMethod: escrow.deliveryMethod,
            deliveryDate: formattedDeliveryDate ?? '',
            deliveryTime: dto.deliveryTime ?? '',
            deliveryLocation: location ?? '',
          },
        });
      }

      return { escrow, deliveryCode };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getDeliveryCode(escrowId: string, buyerId: string): Promise<DeliveryCode> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    if (escrow.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can view the delivery code');
    }

    if (escrow.status !== EscrowStatus.SELLER_READY) {
      throw new BadRequestException('No delivery code available yet');
    }

    const code = await this.deliveryCodeRepo.findOne({
      where: { escrowId, isUsed: false, isInvalidated: false },
      order: { createdAt: 'DESC' },
    });

    if (!code) {
      throw new NotFoundException('No active delivery code found');
    }

    return code;
  }

  async resendDeliveryCode(escrowId: string, buyerId: string): Promise<DeliveryCode> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });

    if (!escrow)
      throw new NotFoundException('Escrow transaction not found');

    if (escrow.buyerId !== buyerId)
      throw new ForbiddenException('Only the buyer can request a new code');

    if (escrow.status !== EscrowStatus.SELLER_READY)
      throw new BadRequestException('No delivery scheduled yet');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Invalidate old codes
      await queryRunner.manager.update(
        DeliveryCode,
        { escrowId, isUsed: false, isInvalidated: false },
        { isInvalidated: true, invalidatedAt: new Date() },
      );

      // Method-appropriate window (fixes the old resend crash on orders
      // without a scheduled date/time, e.g. buy-request escrows).
      const { validFrom, validUntil } = this.computeCodeWindow(escrow);

      // Generate new code
      const newCode = this.deliveryCodeRepo.create({
        escrowId,
        code: this.generateDeliveryCodeValue(),
        validFrom,
        validUntil,
      });

      await queryRunner.manager.save(newCode);
      await queryRunner.commitTransaction();

      this.logger.log(`New delivery code generated for escrow ${escrowId}`);

      return newCode;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async verifyDeliveryCode(escrowId: string, sellerId: string, code: string): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({ where: { id: escrowId } });

    if (!escrow)
      throw new NotFoundException('Escrow transaction not found');

    if (escrow.sellerId !== sellerId)
      throw new ForbiddenException('Only the seller can verify the code');

    if (escrow.status !== EscrowStatus.SELLER_READY)
      throw new BadRequestException(`Cannot verify code. Order status is: ${escrow.status}`);

    // Find active code
    const deliveryCode = await this.deliveryCodeRepo.findOne({
      where: { escrowId, isUsed: false, isInvalidated: false },
      order: { createdAt: 'DESC' },
    });

    if (!deliveryCode) {
      throw new NotFoundException('No active delivery code found');
    }

    // Anti-brute-force: a 4-digit code is only ~9k values, so cap wrong guesses.
    if (deliveryCode.isLocked) {
      throw new ForbiddenException(
        'Too many incorrect delivery-code attempts. Verification is locked; wait a few minutes or ask the buyer to resend the code.',
      );
    }

    // Validate code matches — a wrong guess counts toward the lockout.
    if (deliveryCode.code !== code) {
      const attempts = deliveryCode.verifyAttempts + 1;
      if (attempts >= this.DELIVERY_CODE_MAX_ATTEMPTS) {
        // Reset the counter and lock; a fresh window opens after the cooldown.
        deliveryCode.verifyAttempts = 0;
        deliveryCode.lockedUntil = new Date(
          Date.now() + this.DELIVERY_CODE_LOCK_MS,
        );
        await this.deliveryCodeRepo.save(deliveryCode);
        throw new ForbiddenException(
          'Too many incorrect delivery-code attempts. Verification is locked for 15 minutes; ask the buyer to resend the code.',
        );
      }
      deliveryCode.verifyAttempts = attempts;
      await this.deliveryCodeRepo.save(deliveryCode);
      throw new BadRequestException(
        `Invalid delivery code. ${
          this.DELIVERY_CODE_MAX_ATTEMPTS - attempts
        } attempt(s) remaining.`,
      );
    }

    // Validate code is within time window (a correct code at the wrong time
    // does not burn an attempt).
    const now = new Date();
    if (now < deliveryCode.validFrom)
      throw new BadRequestException('Delivery code is not yet valid. Please wait until the delivery window.')

    if (now > deliveryCode.validUntil)
      throw new BadRequestException('Delivery code has expired. Please contact the buyer to reschedule.');

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Mark code as used
      deliveryCode.isUsed = true;
      deliveryCode.usedAt = new Date();
      await queryRunner.manager.save(deliveryCode);

      // Update escrow
      const deliveredAt = new Date();
      const disputeWindowExpiresAt = new Date(
        deliveredAt.getTime() + this.DISPUTE_WINDOW_MINUTES * 60 * 1000,
      );

      escrow.status = EscrowStatus.DELIVERED;
      escrow.deliveredAt = deliveredAt;
      escrow.disputeWindowExpiresAt = disputeWindowExpiresAt;

      await queryRunner.manager.save(escrow);

      await queryRunner.commitTransaction();

      // Schedule 24h auto-release job
      await this.escrowQueue.add(
        EscrowJobName.CHECK_AUTO_RELEASE,
        { escrowId },
        {
          delay: this.DISPUTE_WINDOW_MINUTES * 60 * 1000,
          jobId: `auto-release-${escrowId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );

      this.logger.log(`Delivery verified for escrow ${escrowId}, 24h dispute window started`);

      return escrow;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Handle 72h fulfillment expiry (called by processor)
   * Auto-cancels and refunds buyer
   */
  async handleFulfillmentExpiry(escrowId: string): Promise<void> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
    });

    if (!escrow) {
      this.logger.warn(`Escrow ${escrowId} not found for fulfillment expiry`);
      return;
    }

    // Auto-refund if the order hasn't been delivered by the 72h deadline —
    // covers both an unresponsive seller (AWAITING_SELLER) and a seller who
    // marked ready but never completed the handoff (SELLER_READY).
    if (
      escrow.status !== EscrowStatus.AWAITING_SELLER &&
      escrow.status !== EscrowStatus.SELLER_READY
    ) {
      this.logger.log(
        `Escrow ${escrowId} status is ${escrow.status}, skipping expiry`,
      );
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Refund buyer (full amount)
      await this.walletService.refundFunds(
        escrow.buyerId,
        escrow.amount,
        `ESCROW_EXPIRED_${escrow.id}`,
        queryRunner,
        escrow.market ?? null,
      );

      // Update escrow
      escrow.status = EscrowStatus.EXPIRED;
      escrow.cancelledBy = 'system';
      escrow.cancelReason = 'expired';
      escrow.refundedAt = new Date();
      await queryRunner.manager.save(escrow);

      // Release the items' listings back to ACTIVE + restore vendor stock
      const expiredItems = await queryRunner.manager.find(OrderItem, {
        where: { orderId: escrow.id },
      });
      const expiredListingIds = expiredItems
        .map((item) => item.listingId)
        .filter((id): id is string => !!id);
      if (expiredListingIds.length > 0) {
        await queryRunner.manager.update(
          Listing,
          { id: In(expiredListingIds) },
          { status: ListingStatus.ACTIVE },
        );
      }
      await this.restoreVendorStock(queryRunner.manager, escrow.id);

      // Revert buy request to OPEN (if buy-request-based escrow)
      if (escrow.buyRequestOfferId) {
        const offer = await this.buyRequestOfferRepo.findOne({
          where: { id: escrow.buyRequestOfferId },
        });
        if (offer) {
          await queryRunner.manager.update(BuyRequest, offer.buyRequestId, {
            status: BuyRequestStatus.OPEN,
          });
        }
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Escrow ${escrowId} expired, full refund issued to buyer`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Handle 24h auto-release (called by processor)
   * Auto-completes escrow if no dispute was raised
   */
  async handleAutoRelease(escrowId: string): Promise<void> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
    });

    if (!escrow) {
      this.logger.warn(`Escrow ${escrowId} not found for auto-release`);
      return;
    }

    // Only auto-release if still in DELIVERED status
    if (escrow.status !== EscrowStatus.DELIVERED) {
      this.logger.log(
        `Escrow ${escrowId} status is ${escrow.status}, skipping auto-release`,
      );
      return;
    }

    await this.completeEscrow(escrow, 'auto');

    this.logger.log(`Escrow ${escrowId} auto-completed after 24h`);

    // Prompt buyer to rate and review the seller
    await this.notificationsService.createNotification({
      userId: escrow.buyerId,
      type: NotificationType.REVIEW_RECEIVED,
      title: 'How was your experience?',
      body: `Your order ${escrow.orderNumber} is complete. Take a moment to rate and review the seller.`,
      data: {
        escrowId,
        orderNumber: escrow.orderNumber,
        sellerId: escrow.sellerId,
        ...(escrow.checkoutId && { checkoutId: escrow.checkoutId }),
        ...(escrow.buyRequestOfferId && { buyRequestOfferId: escrow.buyRequestOfferId }),
      },
    });
  }

  /**
   * Complete escrow and release funds
   */
  private async completeEscrow(
    escrow: EscrowTransaction,
    trigger: 'auto' | 'manual' | 'dispute',
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Platform fee on the items subtotal (buyer's-university setting per
      // the order's market); delivery fees pass through to the seller.
      const { platformFee, sellerPayout } = await this.getOrderFeeSplit(escrow);

      // Move the full amount out of the buyer's locked balance: payout to the
      // seller, fee to the platform wallet (no refund on a completed order).
      await this.walletService.settleEscrow(
        escrow.buyerId,
        escrow.sellerId,
        {
          total: Number(escrow.amount),
          toSeller: sellerPayout,
          toPlatform: platformFee,
        },
        `ESCROW_RELEASE_${escrow.id}`,
        queryRunner,
        escrow.market ?? null,
      );

      // Credit platform wallet with fee
      await this.platformWalletService.creditPlatformFee(
        platformFee,
        escrow.id,
        PlatformTransactionType.ESCROW_FEE,
        undefined,
        queryRunner,
      );

      // Update escrow
      escrow.status = EscrowStatus.COMPLETED;
      escrow.releasedAt = new Date();
      escrow.platformFee = platformFee;
      escrow.sellerPayout = sellerPayout;

      await queryRunner.manager.save(escrow);

      // Mark the P2P items' listings as sold
      const soldItems = await queryRunner.manager.find(OrderItem, {
        where: { orderId: escrow.id },
      });
      const soldListingIds = soldItems
        .map((item) => item.listingId)
        .filter((id): id is string => !!id);
      if (soldListingIds.length > 0) {
        await queryRunner.manager.update(
          Listing,
          { id: In(soldListingIds) },
          { status: ListingStatus.SOLD },
        );
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Escrow ${escrow.id} completed (${trigger}): seller receives ₦${sellerPayout}, platform fee ₦${platformFee}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Cancel escrow
   * - If AWAITING_SELLER or cancelled by seller: full refund
   * - If SELLER_READY and cancelled by buyer: cancellation fee applies
   */
  async cancelEscrow(
    escrowId: string,
    userId: string,
  ): Promise<{
    escrow: EscrowTransaction;
    cancellationFee: number;
    refundAmount: number;
    sellerCompensation: number;
  }> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
      relations: ['buyer'],
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    const isBuyer = escrow.buyerId === userId;
    const isSeller = escrow.sellerId === userId;

    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('You are not part of this transaction');
    }

    // Cancellable while nothing has been handed over: pending vendor
    // confirmation, awaiting seller, or seller-ready (fee only applies to a
    // buyer cancelling after ready — rev-2 01.2).
    if (
      ![
        EscrowStatus.PENDING_CONFIRMATION,
        EscrowStatus.AWAITING_SELLER,
        EscrowStatus.SELLER_READY,
      ].includes(escrow.status)
    ) {
      throw new BadRequestException(
        `Cannot cancel order. Status is: ${escrow.status}`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      let buyerRefund = Number(escrow.amount);
      let sellerCompensation = 0;
      let platformShare = 0;

      // Buyer no-show on a service (rev-2 03.6/FIG 03.4): a vendor cancelling
      // once the appointment + grace has passed is the "buyer never showed"
      // branch — the standard post-ready fee compensates the held slot. A
      // vendor cancelling any earlier stays a free full refund (01.2).
      const noShowGraceMs =
        this.timingPolicy.resolve().noShowGraceMinutes * 60 * 1000;
      const buyerNoShow =
        isSeller &&
        escrow.status === EscrowStatus.SELLER_READY &&
        !!escrow.appointmentAt &&
        Date.now() >=
          new Date(escrow.appointmentAt).getTime() + noShowGraceMs;

      // The post-ready cancellation fee: a buyer backing out after ready, or
      // a service buyer who never showed up (same 10% / 60-40, spec FIG 03.4).
      if (
        (isBuyer && escrow.status === EscrowStatus.SELLER_READY) ||
        buyerNoShow
      ) {
        // Per-university cancellation policy (settings service; default 10%,
        // enabled — resolved by the buyer's university, rev-2 spec 01.3).
        const settings = await this.universitySettingsService.resolve(
          escrow.buyer.universityId,
        );

        if (settings.cancellationFeeEnabled && settings.cancellationFeePercent > 0) {
          const cancellationFee = percentOf(
            Number(escrow.amount),
            settings.cancellationFeePercent,
          );

          // Split: 60% to seller, remainder to platform (kobo-exact).
          const split = splitByPercent(cancellationFee, 60);
          sellerCompensation = split.portion;
          platformShare = split.remainder;
          buyerRefund = toNaira(
            toKobo(Number(escrow.amount)) - toKobo(cancellationFee),
          );

          this.logger.log(
            `Cancellation fee applied: ₦${cancellationFee} (seller: ₦${sellerCompensation}, platform: ₦${platformShare})`,
          );
        }
      }

      if (sellerCompensation > 0 || platformShare > 0) {
        // Cancellation fee applies: fully release the buyer's hold, distribute
        // the fee (seller compensation + platform share) and refund the rest.
        await this.walletService.settleEscrow(
          escrow.buyerId,
          escrow.sellerId,
          {
            total: Number(escrow.amount),
            toSeller: sellerCompensation,
            toPlatform: platformShare,
          },
          `ESCROW_CANCEL_${escrow.id}`,
          queryRunner,
          escrow.market ?? null,
        );

        if (platformShare > 0) {
          await this.platformWalletService.creditPlatformFee(
            platformShare,
            escrow.id,
            PlatformTransactionType.CANCELLATION_FEE,
            undefined,
            queryRunner,
          );
        }
      } else {
        // No fee: simply unlock the buyer's held funds back to available.
        await this.walletService.refundFunds(
          escrow.buyerId,
          buyerRefund,
          `ESCROW_CANCEL_${escrow.id}`,
          queryRunner,
          escrow.market ?? null,
        );
      }

      escrow.status = EscrowStatus.CANCELLED;
      escrow.cancelledBy = isBuyer ? 'buyer' : 'seller';
      escrow.cancelReason = buyerNoShow
        ? 'buyer_no_show'
        : isBuyer
          ? 'buyer_cancel'
          : 'seller_cancel';
      escrow.refundedAt = new Date();

      await queryRunner.manager.save(escrow);

      // Release the items' listings back to ACTIVE + restore vendor stock
      const cancelledItems = await queryRunner.manager.find(OrderItem, {
        where: { orderId: escrow.id },
      });
      const cancelledListingIds = cancelledItems
        .map((item) => item.listingId)
        .filter((id): id is string => !!id);
      if (cancelledListingIds.length > 0) {
        await queryRunner.manager.update(
          Listing,
          { id: In(cancelledListingIds) },
          { status: ListingStatus.ACTIVE },
        );
      }
      await this.restoreVendorStock(queryRunner.manager, escrow.id);

      // Close out any open time proposal (service orders only; no-op for goods).
      await queryRunner.manager.update(
        ServiceTimeProposal,
        { orderId: escrow.id, status: ProposalStatus.PENDING },
        { status: ProposalStatus.EXPIRED },
      );

      // Revert buy request to OPEN (if buy-request-based escrow)
      if (escrow.buyRequestOfferId) {
        const offer = await this.buyRequestOfferRepo.findOne({
          where: { id: escrow.buyRequestOfferId },
        });
        if (offer) {
          await queryRunner.manager.update(BuyRequest, offer.buyRequestId, {
            status: BuyRequestStatus.OPEN,
          });
        }
      }

      // Remove any pending jobs
      await this.escrowQueue.remove(`fulfillment-expiry-${escrowId}`);
      await this.escrowQueue.remove(`auto-release-${escrowId}`);
      await this.escrowQueue.remove(`confirm-timeout-${escrowId}`);
      await this.escrowQueue.remove(`agreement-timeout-${escrowId}`);
      await this.escrowQueue.remove(`appointment-backstop-${escrowId}`);
      await this.cancelFulfillmentReminders(escrowId);

      await queryRunner.commitTransaction();

      const cancellationFee = sellerCompensation + platformShare;

      this.logger.log(
        `Escrow ${escrowId} cancelled by ${isBuyer ? 'buyer' : 'seller'}`,
      );

      return {
        escrow,
        cancellationFee,
        refundAmount: buyerRefund,
        sellerCompensation,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Open a dispute (only during DELIVERED status, within 24h window)
   */
  async openDispute(
    escrowId: string,
    userId: string,
    dto: OpenDisputeDto,
  ): Promise<Dispute> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    // Only buyer or seller can open dispute
    if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
      throw new ForbiddenException('You are not part of this transaction');
    }

    // Can only dispute during DELIVERED status (24h window)
    if (escrow.status !== EscrowStatus.DELIVERED) {
      throw new BadRequestException(
        'Disputes can only be raised after delivery and within 24 hours',
      );
    }

    // Check dispute window hasn't expired
    if (escrow.disputeWindowExpiresAt && new Date() > escrow.disputeWindowExpiresAt) {
      throw new BadRequestException(
        'Dispute window has expired. The transaction will be auto-completed.',
      );
    }

    // Check for existing dispute
    const existingDispute = await this.disputeRepo.findOne({
      where: { escrowId, status: DisputeStatus.OPEN },
    });

    if (existingDispute) {
      throw new BadRequestException(
        'A dispute is already open for this transaction',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create dispute
      const dispute = this.disputeRepo.create({
        escrowId,
        openedById: userId,
        reason: dto.reason,
        description: dto.description,
        evidence: dto.evidence || null,
        status: DisputeStatus.OPEN,
      });

      const savedDispute = await queryRunner.manager.save(dispute);

      // Update escrow status
      escrow.status = EscrowStatus.DISPUTED;
      await queryRunner.manager.save(escrow);

      // Cancel auto-release job
      await this.escrowQueue.remove(`auto-release-${escrowId}`);

      await queryRunner.commitTransaction();

      this.logger.log(`Dispute ${savedDispute.id} opened for escrow ${escrowId}`);

      return savedDispute;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Resolve a dispute (admin only)
   */
  async resolveDispute(
    disputeId: string,
    adminId: string,
    dto: ResolveDisputeDto,
  ): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: ['escrow'],
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    if (
      ![DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW].includes(dispute.status)
    ) {
      throw new BadRequestException('Dispute is already resolved');
    }

    const escrow = dispute.escrow;

    // Validate resolution amounts for split: the gross buyer refund and seller
    // release must sum EXACTLY to the escrow amount (the platform's 1%-per-side
    // cut is taken from these gross figures, not added on top).
    if (dto.resolution === DisputeStatus.RESOLVED_SPLIT) {
      const buyerRefundGross = Number(dto.buyerRefundAmount || 0);
      const sellerReleaseGross = Number(dto.sellerReleaseAmount || 0);
      if (buyerRefundGross <= 0 && sellerReleaseGross <= 0) {
        throw new BadRequestException(
          'Please specify refund/release amounts for split resolution',
        );
      }
      if (
        toKobo(buyerRefundGross) + toKobo(sellerReleaseGross) !==
        toKobo(Number(escrow.amount))
      ) {
        throw new BadRequestException(
          'Buyer refund and seller release must sum exactly to the escrow amount',
        );
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      switch (dto.resolution) {
        case DisputeStatus.RESOLVED_BUYER:
          // Full refund to buyer
          await this.walletService.refundFunds(
            escrow.buyerId,
            escrow.amount,
            `DISPUTE_REFUND_${dispute.id}`,
            queryRunner,
            escrow.market ?? null,
          );
          dispute.buyerRefundAmount = escrow.amount;
          escrow.status = EscrowStatus.REFUNDED;
          escrow.refundedAt = new Date();
          break;

        case DisputeStatus.RESOLVED_SELLER: {
          // Release to seller, with the platform fee deducted — same rule as
          // auto-completion (market-aware, fee on the items subtotal).
          const { platformFee, sellerPayout } = await this.getOrderFeeSplit(
            escrow,
          );

          await this.walletService.settleEscrow(
            escrow.buyerId,
            escrow.sellerId,
            {
              total: Number(escrow.amount),
              toSeller: sellerPayout,
              toPlatform: platformFee,
            },
            `DISPUTE_RELEASE_${dispute.id}`,
            queryRunner,
            escrow.market ?? null,
          );

          await this.platformWalletService.creditPlatformFee(
            platformFee,
            escrow.id,
            PlatformTransactionType.ESCROW_FEE,
            undefined,
            queryRunner,
          );

          dispute.sellerReleaseAmount = sellerPayout;
          escrow.status = EscrowStatus.COMPLETED;
          escrow.releasedAt = new Date();
          escrow.platformFee = platformFee;
          escrow.sellerPayout = sellerPayout;
          break;
        }

        case DisputeStatus.RESOLVED_SPLIT: {
          // Gross amounts sum to escrow.amount (validated above). Platform
          // takes 1% from each side; buyer/seller receive the remaining 99%.
          const buyerRefundGross = Number(dto.buyerRefundAmount || 0);
          const sellerReleaseGross = Number(dto.sellerReleaseAmount || 0);

          const platformFromRefund = percentOf(buyerRefundGross, 1);
          const platformFromRelease = percentOf(sellerReleaseGross, 1);
          const toPlatform = toNaira(
            toKobo(platformFromRefund) + toKobo(platformFromRelease),
          );
          const toSeller = toNaira(
            toKobo(sellerReleaseGross) - toKobo(platformFromRelease),
          );
          // Buyer refund (= buyerRefundGross - platformFromRefund) is the
          // implicit remainder handled inside settleEscrow.

          await this.walletService.settleEscrow(
            escrow.buyerId,
            escrow.sellerId,
            { total: Number(escrow.amount), toSeller, toPlatform },
            `DISPUTE_SPLIT_${dispute.id}`,
            queryRunner,
            escrow.market ?? null,
          );

          if (toPlatform > 0) {
            await this.platformWalletService.creditPlatformFee(
              toPlatform,
              escrow.id,
              PlatformTransactionType.ESCROW_FEE,
              'Platform fee from disputed split resolution',
              queryRunner,
            );
          }

          dispute.buyerRefundAmount = dto.buyerRefundAmount || null;
          dispute.sellerReleaseAmount = dto.sellerReleaseAmount || null;
          escrow.status = EscrowStatus.COMPLETED;
          escrow.releasedAt = new Date();
          escrow.platformFee = toPlatform;
          break;
        }
      }

      // Update dispute
      dispute.status = dto.resolution;
      dispute.resolution = dto.resolutionNotes;
      dispute.resolvedById = adminId;
      dispute.resolvedAt = new Date();

      await queryRunner.manager.save(dispute);
      await queryRunner.manager.save(escrow);

      // Update the items' listings: buyer-favour resolutions release them,
      // everything else marks them sold.
      const disputedItems = await queryRunner.manager.find(OrderItem, {
        where: { orderId: escrow.id },
      });
      const disputedListingIds = disputedItems
        .map((item) => item.listingId)
        .filter((id): id is string => !!id);
      if (disputedListingIds.length > 0) {
        await queryRunner.manager.update(
          Listing,
          { id: In(disputedListingIds) },
          {
            status:
              dto.resolution === DisputeStatus.RESOLVED_BUYER
                ? ListingStatus.ACTIVE
                : ListingStatus.SOLD,
          },
        );
      }

      // Revert buy request to OPEN if resolved in buyer's favor
      if (escrow.buyRequestOfferId && dto.resolution === DisputeStatus.RESOLVED_BUYER) {
        const offer = await this.buyRequestOfferRepo.findOne({
          where: { id: escrow.buyRequestOfferId },
        });
        if (offer) {
          await queryRunner.manager.update(BuyRequest, offer.buyRequestId, {
            status: BuyRequestStatus.OPEN,
          });
        }
      }

      await queryRunner.commitTransaction();

      this.logger.log(`Dispute ${disputeId} resolved: ${dto.resolution}`);

      return dispute;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get escrow by ID
   */
  async getEscrow(
    escrowId: string,
    userId: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
      relations: ['buyer', 'seller', 'orderItems', 'buyRequestOffer', 'buyRequestOffer.buyRequest'],
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    // Only parties can view
    if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
      throw new ForbiddenException('You are not part of this transaction');
    }

    return escrow;
  }

  /**
   * Get user's escrow transactions
   */
  async getUserEscrows(
    userId: string,
    role: 'buyer' | 'seller' | 'all' = 'all',
    page = 1,
    limit = 20,
    market?: OrderMarket,
    status?: EscrowStatus,
  ): Promise<{ escrows: EscrowTransaction[]; total: number }> {
    const extra = {
      ...(market && { market }),
      ...(status && { status }),
    };
    let where:
      | Record<string, unknown>
      | Array<Record<string, unknown>>;

    if (role === 'buyer') {
      where = { buyerId: userId, ...extra };
    } else if (role === 'seller') {
      where = { sellerId: userId, ...extra };
    } else {
      where = [
        { buyerId: userId, ...extra },
        { sellerId: userId, ...extra },
      ];
    }

    const [escrows, total] = await this.escrowRepo.findAndCount({
      where,
      relations: ['orderItems', 'buyRequestOffer', 'buyRequestOffer.buyRequest'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { escrows, total };
  }

  /**
   * Admin: list all escrow transactions with filters
   */
  async adminListEscrow(dto: AdminListEscrowDto): Promise<{ escrows: EscrowTransaction[]; total: number }> {
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);
    const sortOrder = dto.sortOrder || 'DESC';

    const qb = this.escrowRepo.createQueryBuilder('e')
      .leftJoinAndSelect('e.buyer', 'buyer')
      .leftJoinAndSelect('e.seller', 'seller')
      .leftJoinAndSelect('e.orderItems', 'orderItems');

    if (dto.status) {
      qb.andWhere('e.status = :status', { status: dto.status });
    }
    if (dto.buyerId) {
      qb.andWhere('e.buyerId = :buyerId', { buyerId: dto.buyerId });
    }
    if (dto.sellerId) {
      qb.andWhere('e.sellerId = :sellerId', { sellerId: dto.sellerId });
    }
    if (dto.dateFrom) {
      qb.andWhere('e.createdAt >= :dateFrom', { dateFrom: dto.dateFrom });
    }
    if (dto.dateTo) {
      qb.andWhere('e.createdAt <= :dateTo', { dateTo: dto.dateTo });
    }
    if (dto.minAmount) {
      qb.andWhere('e.amount >= :minAmount', { minAmount: toKobo(Number(dto.minAmount)) });
    }
    if (dto.maxAmount) {
      qb.andWhere('e.amount <= :maxAmount', { maxAmount: toKobo(Number(dto.maxAmount)) });
    }

    qb.orderBy('e.createdAt', sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [escrows, total] = await qb.getManyAndCount();

    // Sanitize user data
    escrows.forEach(e => {
      if (e.buyer) {
        delete (e.buyer as any).passwordHash;
        delete (e.buyer as any).refreshTokenHash;
      }
      if (e.seller) {
        delete (e.seller as any).passwordHash;
        delete (e.seller as any).refreshTokenHash;
      }
    });

    return { escrows, total };
  }

  /**
   * Get disputes for admin review
   */
  async getOpenDisputes(
    page = 1,
    limit = 20,
  ): Promise<{ disputes: Dispute[]; total: number }> {
    const [disputes, total] = await this.disputeRepo.findAndCount({
      where: [
        { status: DisputeStatus.OPEN },
        { status: DisputeStatus.UNDER_REVIEW },
      ],
      relations: ['escrow', 'openedBy'],
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { disputes, total };
  }

  /**
   * Get dispute by ID
   */
  async getDispute(disputeId: string): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: [
        'escrow',
        'escrow.buyer',
        'escrow.seller',
        'openedBy',
        'resolvedBy',
      ],
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }
}
