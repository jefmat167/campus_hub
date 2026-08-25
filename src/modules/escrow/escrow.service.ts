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
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomInt } from 'crypto';
import {
  EscrowTransaction,
  EscrowStatus,
} from '../../database/entities/escrow.entity';
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
  InitiateEscrowDto,
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
   * Platform fee % for an order, resolved per the BUYER's university (rev-2
   * spec 01.3). Falls back to the platform default when the buyer carries no
   * university or the university has no override.
   */
  private async getPlatformFeePercentForBuyer(buyerId: string): Promise<number> {
    const buyer = await this.userRepo.findOne({
      where: { id: buyerId },
      select: ['id', 'universityId'],
    });
    const settings = await this.universitySettingsService.resolve(
      buyer?.universityId ?? null,
    );
    return settings.p2pFeePercent;
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
        ...(escrow.listingId && { listingId: escrow.listingId }),
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
   * Generate 4-digit delivery code
   */
  private generateDeliveryCodeValue(): string {
    // Cryptographically secure (not Math.random). 4-digit, 1000–9999.
    return String(randomInt(1000, 10000));
  }

  /**
   * Initiate an escrow transaction
   * Buyer pays exact item price (no platform fee added)
   */
  async initiateEscrow(buyerId: string, dto: InitiateEscrowDto): Promise<EscrowTransaction> {
    const listing = await this.listingRepo.findOne({
      where: { id: dto.listingId },
      relations: ['seller'],
    });

    if (!listing) {
      throw new NotFoundException('Listing not found');
    }

    if (listing.status !== ListingStatus.ACTIVE) {
      throw new BadRequestException('Listing is no longer available');
    }

    if (listing.sellerId === buyerId) {
      throw new BadRequestException('You cannot buy your own listing');
    }

    // Check buyer's wallet balance (exact amount, no fee)
    const balance = await this.walletService.getBalance(buyerId);
    if (balance.availableBalance < dto.amount) {
      throw new BadRequestException(`Insufficient balance. You need ₦${dto.amount.toLocaleString()}`);
    }

    // Validate the buyer's chosen delivery method against the listing's offered
    // set, and resolve the concrete location to snapshot onto the order.
    const offeredMethods = listing.deliveryMethods ?? [];
    if (!offeredMethods.includes(dto.deliveryMethod)) {
      throw new BadRequestException(
        'Selected delivery method is not offered for this listing',
      );
    }
    let deliveryLocation: string;
    if (dto.deliveryMethod === DeliveryMethod.MEETUP) {
      const points = listing.meetupPoints ?? [];
      if (
        dto.meetupPointIndex === undefined ||
        dto.meetupPointIndex < 0 ||
        dto.meetupPointIndex >= points.length
      ) {
        throw new BadRequestException(
          'A valid meet-up point selection is required for meet-up delivery',
        );
      }
      deliveryLocation = points[dto.meetupPointIndex];
    } else {
      if (!listing.pickupAddress) {
        throw new BadRequestException(
          'This listing has no pickup address configured',
        );
      }
      deliveryLocation = listing.pickupAddress;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const orderNumber = await this.generateOrderNumber();
      const fulfillmentExpiresAt = new Date(Date.now() + this.FULFILLMENT_HOURS * 60 * 60 * 1000);

      // Create escrow transaction
      const escrow = this.escrowRepo.create({
        buyerId,
        sellerId: listing.sellerId,
        listingId: dto.listingId,
        offerId: dto.offerId || null,
        amount: dto.amount,
        orderNumber,
        status: EscrowStatus.AWAITING_SELLER,
        fulfillmentExpiresAt,
        notes: dto.notes || null,
        deliveryMethod: dto.deliveryMethod,
        deliveryLocation,
      });

      const savedEscrow = await queryRunner.manager.save(escrow);

      // Lock buyer's funds (exact amount, no fee)
      await this.walletService.lockFunds(buyerId, dto.amount, `ESCROW_${savedEscrow.id}`, queryRunner);

      // Update listing status
      listing.status = ListingStatus.IN_ESCROW;
      await queryRunner.manager.save(listing);

      await queryRunner.commitTransaction();

      // Schedule 72h fulfillment expiry job
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

      this.logger.log(`Escrow ${savedEscrow.id} (${orderNumber}) initiated for ₦${dto.amount}`);

      // Fetch buyer for notifications
      const buyer = await this.userRepo.findOne({ where: { id: buyerId } });
      const formattedAmount = dto.amount.toLocaleString();

      // Notify buyer — push + in-app
      await this.notificationsService.createNotification({
        userId: buyerId,
        type: NotificationType.ESCROW_INITIATED,
        title: 'Order confirmed',
        body: `Your order ${orderNumber} for "${listing.title}" (₦${formattedAmount}) has been placed. The seller has 72 hours to respond.`,
        data: {
          escrowId: savedEscrow.id,
          orderNumber,
          listingId: listing.id,
          amount: dto.amount,
        },
      });

      // Notify seller — push + in-app
      await this.notificationsService.createNotification({
        userId: listing.sellerId,
        type: NotificationType.ESCROW_INITIATED,
        title: 'New order on your listing',
        body: `A buyer has placed an order (${orderNumber}) for ₦${formattedAmount} on "${listing.title}". You have 72 hours to respond.`,
        data: {
          escrowId: savedEscrow.id,
          orderNumber,
          listingId: listing.id,
          amount: dto.amount,
        },
      });

      // Send order confirmation email to buyer
      if (buyer?.email) {
        await this.resendService.sendEmail({
          to: buyer.email,
          subject: `Order Confirmed — ${orderNumber}`,
          template: 'orderConfirmationBuyer',
          context: {
            buyerName: buyer.fullName,
            orderNumber,
            listingTitle: listing.title,
            amount: formattedAmount,
            sellerName: listing.seller.fullName,
          },
        });
      }

      // Send new order email to seller
      if (listing.seller?.email) {
        await this.resendService.sendEmail({
          to: listing.seller.email,
          subject: `New Order — ${orderNumber}`,
          template: 'newOrderSeller',
          context: {
            sellerName: listing.seller.fullName,
            orderNumber,
            listingTitle: listing.title,
            amount: formattedAmount,
          },
        });
      }

      return savedEscrow;
    } catch (error) {
      console.log("unable to create escrow => ", error);
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Resolve the display title for an escrow (listing title or buy request title)
   */
  private async getItemTitle(escrow: EscrowTransaction): Promise<string> {
    if (escrow.listingId) {
      const listing = await this.listingRepo.findOne({ where: { id: escrow.listingId } });
      return listing?.title ?? 'Unknown item';
    }
    if (escrow.buyRequestOfferId) {
      const offer = await this.buyRequestOfferRepo.findOne({
        where: { id: escrow.buyRequestOfferId },
        relations: ['buyRequest'],
      });
      return offer?.buyRequest?.title ?? 'Buy request item';
    }
    return 'Unknown item';
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

    // Create escrow — no listing, linked to buy request offer
    const escrow = this.escrowRepo.create({
      buyerId,
      sellerId,
      listingId: null,
      buyRequestOfferId: offer.id,
      offerId: null,
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
      // pick-up is collect-any-time at the pickup address.
      const body = isMeetup
        ? `The seller is ready for order ${escrow.orderNumber}. Your delivery code is ${deliveryCode.code}. Meet-up scheduled for ${formattedDeliveryDate} at ${dto.deliveryTime}, at ${location}.`
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

    // These should exist since status is SELLER_READY
    if (!escrow.deliveryDate || !escrow.deliveryTime)
      throw new BadRequestException('Delivery details missing');

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

      // Parse delivery date and time for new code validity
      const deliveryDateObj = new Date(escrow.deliveryDate);
      const [hours, minutes] = escrow.deliveryTime.split(':').map(Number);
      deliveryDateObj.setHours(hours, minutes, 0, 0);

      const validFrom = new Date(deliveryDateObj.getTime() - 2 * 60 * 60 * 1000);
      const validUntil = new Date(deliveryDateObj.getTime() + 2 * 60 * 60 * 1000);

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
      );

      // Update escrow
      escrow.status = EscrowStatus.EXPIRED;
      escrow.refundedAt = new Date();
      await queryRunner.manager.save(escrow);

      // Release listing (if listing-based escrow)
      if (escrow.listingId) {
        await queryRunner.manager.update(Listing, escrow.listingId, {
          status: ListingStatus.ACTIVE,
        });
      }

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
        ...(escrow.listingId && { listingId: escrow.listingId }),
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
      // Platform fee (buyer's-university setting, default 2.5%), computed in
      // kobo so fee + payout === amount.
      const feePercent = await this.getPlatformFeePercentForBuyer(
        escrow.buyerId,
      );
      const { fee: platformFee, payout: sellerPayout } = splitFee(
        Number(escrow.amount),
        feePercent,
      );

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

      // Update listing to sold (if listing-based escrow)
      if (escrow.listingId) {
        await queryRunner.manager.update(Listing, escrow.listingId, {
          status: ListingStatus.SOLD,
        });
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

    // Can only cancel if AWAITING_SELLER or SELLER_READY
    if (
      ![EscrowStatus.AWAITING_SELLER, EscrowStatus.SELLER_READY].includes(
        escrow.status,
      )
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

      // If buyer cancels after seller is ready, apply cancellation fee
      if (isBuyer && escrow.status === EscrowStatus.SELLER_READY) {
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
        );
      }

      escrow.status = EscrowStatus.CANCELLED;
      escrow.refundedAt = new Date();

      await queryRunner.manager.save(escrow);

      // Release listing (if listing-based escrow)
      if (escrow.listingId) {
        await queryRunner.manager.update(Listing, escrow.listingId, {
          status: ListingStatus.ACTIVE,
        });
      }

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
          );
          dispute.buyerRefundAmount = escrow.amount;
          escrow.status = EscrowStatus.REFUNDED;
          escrow.refundedAt = new Date();
          break;

        case DisputeStatus.RESOLVED_SELLER: {
          // Release to seller, with the platform fee deducted (buyer's-
          // university setting, default 2.5% — same rule as auto-completion).
          const feePercent = await this.getPlatformFeePercentForBuyer(
            escrow.buyerId,
          );
          const { fee: platformFee, payout: sellerPayout } = splitFee(
            Number(escrow.amount),
            feePercent,
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

      // Update listing status (if listing-based escrow)
      if (escrow.listingId) {
        await queryRunner.manager.update(Listing, escrow.listingId, {
          status:
            dto.resolution === DisputeStatus.RESOLVED_BUYER
              ? ListingStatus.ACTIVE
              : ListingStatus.SOLD,
        });
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
      relations: ['buyer', 'seller', 'listing', 'buyRequestOffer', 'buyRequestOffer.buyRequest'],
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
  ): Promise<{ escrows: EscrowTransaction[]; total: number }> {
    let where:
      | { buyerId: string }
      | { sellerId: string }
      | Array<{ buyerId: string } | { sellerId: string }>;

    if (role === 'buyer') {
      where = { buyerId: userId };
    } else if (role === 'seller') {
      where = { sellerId: userId };
    } else {
      where = [{ buyerId: userId }, { sellerId: userId }];
    }

    const [escrows, total] = await this.escrowRepo.findAndCount({
      where,
      relations: ['listing', 'buyRequestOffer', 'buyRequestOffer.buyRequest'],
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
      .leftJoinAndSelect('e.listing', 'listing');

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
