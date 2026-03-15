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
import {
  EscrowTransaction,
  EscrowStatus,
} from '../../database/entities/escrow.entity';
import {
  Dispute,
  DisputeStatus,
} from '../../database/entities/dispute.entity';
import { DeliveryCode } from '../../database/entities/delivery-code.entity';
import { Listing, ListingStatus } from '../../database/entities/listing.entity';
import { User } from '../../database/entities/user.entity';
import { University } from '../../database/entities/university.entity';
import { WalletService } from '../wallet/wallet.service';
import { PlatformWalletService } from '../wallet/platform-wallet.service';
import { PlatformTransactionType } from '../../database/entities/platform-wallet.entity';
import {
  InitiateEscrowDto,
  OpenDisputeDto,
  ResolveDisputeDto,
  SellerReadyDto,
} from './dto';
import {
  ESCROW_QUEUE_NAME,
  EscrowJobName,
} from './interfaces/escrow-jobs.interface';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import { ResendService } from '../email/resend.service';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private readonly PLATFORM_FEE_PERCENTAGE = 2.5; // 2.5% platform fee (deducted from seller)
  private readonly FULFILLMENT_HOURS = 72; // 72 hours for seller to respond
  private readonly DISPUTE_WINDOW_HOURS = 24; // 24 hours to raise dispute after delivery

  constructor(
    @InjectRepository(EscrowTransaction)
    private escrowRepo: Repository<EscrowTransaction>,
    @InjectRepository(Dispute)
    private disputeRepo: Repository<Dispute>,
    @InjectRepository(DeliveryCode)
    private deliveryCodeRepo: Repository<DeliveryCode>,
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    @InjectRepository(University)
    private universityRepo: Repository<University>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private walletService: WalletService,
    @Inject(forwardRef(() => PlatformWalletService))
    private platformWalletService: PlatformWalletService,
    private dataSource: DataSource,
    @InjectQueue(ESCROW_QUEUE_NAME)
    private escrowQueue: Queue,
    private notificationsService: NotificationsService,
    private resendService: ResendService,
  ) { }

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
    return String(Math.floor(1000 + Math.random() * 9000));
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
      });

      const savedEscrow = await queryRunner.manager.save(escrow);

      // Lock buyer's funds (exact amount, no fee)
      await this.walletService.lockFunds(buyerId, dto.amount, `ESCROW_${savedEscrow.id}`);

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

    // Parse delivery date and time
    const deliveryDateObj = new Date(dto.deliveryDate);
    const [hours, minutes] = dto.deliveryTime.split(':').map(Number);
    deliveryDateObj.setHours(hours, minutes, 0, 0);

    // Validate delivery is in the future
    if (deliveryDateObj <= new Date()) {
      throw new BadRequestException('Delivery time must be in the future');
    }

    // Calculate code validity window (±2 hours)
    const validFrom = new Date(deliveryDateObj.getTime() - 2 * 60 * 60 * 1000);
    const validUntil = new Date(deliveryDateObj.getTime() + 2 * 60 * 60 * 1000);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update escrow
      escrow.status = EscrowStatus.SELLER_READY;
      escrow.sellerReadyAt = new Date();
      escrow.deliveryDate = new Date(dto.deliveryDate);
      escrow.deliveryTime = dto.deliveryTime;
      escrow.deliveryLocation = dto.deliveryLocation;

      await queryRunner.manager.save(escrow);

      // Generate delivery code
      const deliveryCode = this.deliveryCodeRepo.create({
        escrowId,
        code: this.generateDeliveryCodeValue(),
        validFrom,
        validUntil,
      });

      await queryRunner.manager.save(deliveryCode);

      // Remove fulfillment expiry job (seller responded in time)
      await this.escrowQueue.remove(`fulfillment-expiry-${escrowId}`);

      await queryRunner.commitTransaction();

      this.logger.log(`Seller ready for escrow ${escrowId}, delivery scheduled for ${dto.deliveryDate} ${dto.deliveryTime}`);

      // Notify buyer — push + in-app
      await this.notificationsService.createNotification({
        userId: escrow.buyerId,
        type: NotificationType.DELIVERY_CODE_SENT,
        title: 'Your delivery code is ready',
        body: `The seller is ready for order ${escrow.orderNumber}. Delivery scheduled for ${dto.deliveryDate} at ${dto.deliveryTime} at ${dto.deliveryLocation}.`,
        data: {
          escrowId,
          orderNumber: escrow.orderNumber,
          deliveryDate: dto.deliveryDate,
          deliveryTime: dto.deliveryTime,
          deliveryLocation: dto.deliveryLocation,
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
            deliveryDate: dto.deliveryDate,
            deliveryTime: dto.deliveryTime,
            deliveryLocation: dto.deliveryLocation,
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

    // Validate code matches
    if (deliveryCode.code !== code) {
      throw new BadRequestException('Invalid delivery code');
    }

    // Validate code is within time window
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
        deliveredAt.getTime() + this.DISPUTE_WINDOW_HOURS * 60 * 60 * 1000,
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
          delay: this.DISPUTE_WINDOW_HOURS * 60 * 60 * 1000,
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

    // Only expire if still awaiting seller
    if (escrow.status !== EscrowStatus.AWAITING_SELLER) {
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
      );

      // Update escrow
      escrow.status = EscrowStatus.EXPIRED;
      escrow.refundedAt = new Date();
      await queryRunner.manager.save(escrow);

      // Release listing
      await queryRunner.manager.update(Listing, escrow.listingId, {
        status: ListingStatus.ACTIVE,
      });

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
        listingId: escrow.listingId,
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
      // Calculate platform fee (2.5%)
      const platformFee =
        (Number(escrow.amount) * this.PLATFORM_FEE_PERCENTAGE) / 100;
      const sellerPayout = Number(escrow.amount) - platformFee;

      // Release funds to seller (minus platform fee)
      await this.walletService.releaseFunds(
        escrow.buyerId,
        escrow.sellerId,
        sellerPayout,
        `ESCROW_RELEASE_${escrow.id}`,
      );

      // Credit platform wallet with fee
      await this.platformWalletService.creditPlatformFee(
        platformFee,
        escrow.id,
        PlatformTransactionType.ESCROW_FEE,
      );

      // Update escrow
      escrow.status = EscrowStatus.COMPLETED;
      escrow.releasedAt = new Date();
      escrow.platformFee = platformFee;
      escrow.sellerPayout = sellerPayout;

      await queryRunner.manager.save(escrow);

      // Update listing to sold
      await queryRunner.manager.update(Listing, escrow.listingId, {
        status: ListingStatus.SOLD,
      });

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
        // Get university cancellation policy
        const university = await this.universityRepo.findOne({
          where: { id: escrow.buyer.universityId },
        });

        if (university?.cancellationFeeEnabled && university.cancellationFeePercent > 0) {
          const cancellationFee =
            (Number(escrow.amount) * Number(university.cancellationFeePercent)) / 100;

          // Split: 60% to seller, 40% to platform
          sellerCompensation = cancellationFee * 0.6;
          platformShare = cancellationFee * 0.4;
          buyerRefund = Number(escrow.amount) - cancellationFee;

          this.logger.log(
            `Cancellation fee applied: ₦${cancellationFee} (seller: ₦${sellerCompensation}, platform: ₦${platformShare})`,
          );
        }
      }

      // Refund buyer
      if (buyerRefund > 0) {
        await this.walletService.refundFunds(
          escrow.buyerId,
          buyerRefund,
          `ESCROW_CANCEL_${escrow.id}`,
        );
      }

      // Credit seller compensation
      if (sellerCompensation > 0) {
        await this.walletService.creditWallet(
          escrow.sellerId,
          sellerCompensation,
          `CANCEL_COMPENSATION_${escrow.id}`,
        );
      }

      // Credit platform share
      if (platformShare > 0) {
        await this.platformWalletService.creditPlatformFee(
          platformShare,
          escrow.id,
          PlatformTransactionType.CANCELLATION_FEE,
        );
      }

      escrow.status = EscrowStatus.CANCELLED;
      escrow.refundedAt = new Date();

      await queryRunner.manager.save(escrow);

      // Release listing
      await queryRunner.manager.update(Listing, escrow.listingId, {
        status: ListingStatus.ACTIVE,
      });

      // Remove any pending jobs
      await this.escrowQueue.remove(`fulfillment-expiry-${escrowId}`);
      await this.escrowQueue.remove(`auto-release-${escrowId}`);

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

    // Validate resolution amounts for split
    if (dto.resolution === DisputeStatus.RESOLVED_SPLIT) {
      if (!dto.buyerRefundAmount && !dto.sellerReleaseAmount) {
        throw new BadRequestException(
          'Please specify refund/release amounts for split resolution',
        );
      }
      const total =
        (dto.buyerRefundAmount || 0) + (dto.sellerReleaseAmount || 0);
      if (total > Number(escrow.amount)) {
        throw new BadRequestException('Total exceeds escrow amount');
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
          );
          dispute.buyerRefundAmount = escrow.amount;
          escrow.status = EscrowStatus.REFUNDED;
          escrow.refundedAt = new Date();
          break;

        case DisputeStatus.RESOLVED_SELLER:
          // Release to seller (with platform fee deduction)
          const platformFee =
            (Number(escrow.amount) * this.PLATFORM_FEE_PERCENTAGE) / 100;
          const sellerPayout = Number(escrow.amount) - platformFee;

          await this.walletService.releaseFunds(
            escrow.buyerId,
            escrow.sellerId,
            sellerPayout,
            `DISPUTE_RELEASE_${dispute.id}`,
          );

          await this.platformWalletService.creditPlatformFee(
            platformFee,
            escrow.id,
            PlatformTransactionType.ESCROW_FEE,
          );

          dispute.sellerReleaseAmount = sellerPayout;
          escrow.status = EscrowStatus.COMPLETED;
          escrow.releasedAt = new Date();
          escrow.platformFee = platformFee;
          escrow.sellerPayout = sellerPayout;
          break;

        case DisputeStatus.RESOLVED_SPLIT:
          // Split between buyer and seller
          if (dto.buyerRefundAmount && dto.buyerRefundAmount > 0) {
            await this.walletService.refundFunds(
              escrow.buyerId,
              dto.buyerRefundAmount,
              `DISPUTE_SPLIT_REFUND_${dispute.id}`,
            );
          }
          if (dto.sellerReleaseAmount && dto.sellerReleaseAmount > 0) {
            await this.walletService.releaseFunds(
              escrow.buyerId,
              escrow.sellerId,
              dto.sellerReleaseAmount,
              `DISPUTE_SPLIT_RELEASE_${dispute.id}`,
            );
          }
          dispute.buyerRefundAmount = dto.buyerRefundAmount || null;
          dispute.sellerReleaseAmount = dto.sellerReleaseAmount || null;
          escrow.status = EscrowStatus.COMPLETED;
          escrow.releasedAt = new Date();
          break;
      }

      // Update dispute
      dispute.status = dto.resolution;
      dispute.resolution = dto.resolutionNotes;
      dispute.resolvedById = adminId;
      dispute.resolvedAt = new Date();

      await queryRunner.manager.save(dispute);
      await queryRunner.manager.save(escrow);

      // Update listing status
      await queryRunner.manager.update(Listing, escrow.listingId, {
        status:
          dto.resolution === DisputeStatus.RESOLVED_BUYER
            ? ListingStatus.ACTIVE
            : ListingStatus.SOLD,
      });

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
      relations: ['buyer', 'seller', 'listing'],
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
      relations: ['listing'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
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
