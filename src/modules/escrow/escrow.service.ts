import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  EscrowTransaction,
  EscrowStatus,
} from '../../database/entities/escrow.entity';
import {
  Dispute,
  DisputeStatus,
  DisputeReason,
} from '../../database/entities/dispute.entity';
import { Listing, ListingStatus } from '../../database/entities/listing.entity';
import { WalletService } from '../wallet/wallet.service';
import { InitiateEscrowDto, OpenDisputeDto, ResolveDisputeDto } from './dto';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private readonly PLATFORM_FEE_PERCENTAGE = 2.5; // 2.5% platform fee
  private readonly ESCROW_EXPIRY_DAYS = 7; // 7 days to complete transaction

  constructor(
    @InjectRepository(EscrowTransaction)
    private escrowRepo: Repository<EscrowTransaction>,
    @InjectRepository(Dispute)
    private disputeRepo: Repository<Dispute>,
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    private walletService: WalletService,
    private dataSource: DataSource,
  ) {}

  /**
   * Initiate an escrow transaction
   * Buyer pays the amount which is held in escrow
   */
  async initiateEscrow(
    buyerId: string,
    dto: InitiateEscrowDto,
  ): Promise<EscrowTransaction> {
    // Get the listing
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

    // Calculate fee and total
    const fee = (dto.amount * this.PLATFORM_FEE_PERCENTAGE) / 100;
    const totalAmount = dto.amount + fee;

    // Check buyer's wallet balance
    const balance = await this.walletService.getBalance(buyerId);
    if (balance.availableBalance < totalAmount) {
      throw new BadRequestException(
        `Insufficient balance. You need ₦${totalAmount.toLocaleString()} (including ₦${fee.toLocaleString()} platform fee)`,
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Create escrow transaction
      const escrow = this.escrowRepo.create({
        buyerId,
        sellerId: listing.sellerId,
        listingId: dto.listingId,
        offerId: dto.offerId || null,
        amount: dto.amount,
        fee,
        totalAmount,
        status: EscrowStatus.PENDING,
        expiresAt: new Date(Date.now() + this.ESCROW_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
        notes: dto.notes || null,
      });

      const savedEscrow = await queryRunner.manager.save(escrow);

      // Lock buyer's funds
      await this.walletService.lockFunds(
        buyerId,
        totalAmount,
        `ESCROW_${savedEscrow.id}`,
      );

      // Update listing status
      listing.status = ListingStatus.IN_ESCROW;
      await queryRunner.manager.save(listing);

      await queryRunner.commitTransaction();

      this.logger.log(`Escrow ${savedEscrow.id} initiated for ₦${dto.amount}`);

      return savedEscrow;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Buyer confirms receipt of item
   */
  async buyerConfirmReceipt(
    escrowId: string,
    buyerId: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    if (escrow.buyerId !== buyerId) {
      throw new ForbiddenException('You are not the buyer of this transaction');
    }

    if (escrow.status !== EscrowStatus.PENDING) {
      throw new BadRequestException(
        `Cannot confirm receipt. Escrow status is: ${escrow.status}`,
      );
    }

    escrow.status = EscrowStatus.BUYER_CONFIRMED;
    escrow.buyerConfirmedAt = new Date();

    const updated = await this.escrowRepo.save(escrow);

    this.logger.log(`Buyer confirmed receipt for escrow ${escrowId}`);

    return updated;
  }

  /**
   * Seller confirms delivery
   * If buyer has already confirmed, release funds
   */
  async sellerConfirmDelivery(
    escrowId: string,
    sellerId: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    if (escrow.sellerId !== sellerId) {
      throw new ForbiddenException('You are not the seller of this transaction');
    }

    if (![EscrowStatus.PENDING, EscrowStatus.BUYER_CONFIRMED].includes(escrow.status)) {
      throw new BadRequestException(
        `Cannot confirm delivery. Escrow status is: ${escrow.status}`,
      );
    }

    escrow.sellerConfirmedAt = new Date();

    // If buyer has already confirmed, release funds
    if (escrow.status === EscrowStatus.BUYER_CONFIRMED) {
      await this.releaseFunds(escrow);
      escrow.status = EscrowStatus.COMPLETED;
      escrow.releasedAt = new Date();
    } else {
      escrow.status = EscrowStatus.SELLER_CONFIRMED;
    }

    const updated = await this.escrowRepo.save(escrow);

    this.logger.log(`Seller confirmed delivery for escrow ${escrowId}, status: ${updated.status}`);

    return updated;
  }

  /**
   * Release funds to seller (after both parties confirm)
   */
  async releaseEscrow(
    escrowId: string,
    buyerId: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    if (escrow.buyerId !== buyerId) {
      throw new ForbiddenException('Only the buyer can release escrow funds');
    }

    if (![EscrowStatus.PENDING, EscrowStatus.BUYER_CONFIRMED, EscrowStatus.SELLER_CONFIRMED].includes(escrow.status)) {
      throw new BadRequestException(
        `Cannot release funds. Escrow status is: ${escrow.status}`,
      );
    }

    await this.releaseFunds(escrow);

    escrow.status = EscrowStatus.COMPLETED;
    escrow.releasedAt = new Date();

    const updated = await this.escrowRepo.save(escrow);

    // Update listing to sold
    await this.listingRepo.update(escrow.listingId, {
      status: ListingStatus.SOLD,
    });

    this.logger.log(`Escrow ${escrowId} released, funds transferred to seller`);

    return updated;
  }

  /**
   * Release locked funds to seller
   */
  private async releaseFunds(escrow: EscrowTransaction): Promise<void> {
    // Release funds from buyer to seller (minus platform fee)
    await this.walletService.releaseFunds(
      escrow.buyerId,
      escrow.sellerId,
      escrow.amount, // Seller receives the original amount
      `ESCROW_${escrow.id}`,
    );

    // Platform fee stays locked and would be released to platform wallet
    // For now, we'll just deduct it from buyer's locked balance
    await this.walletService.refundFunds(
      escrow.buyerId,
      0, // No additional refund
      `ESCROW_FEE_${escrow.id}`,
    );
  }

  /**
   * Cancel escrow and refund buyer
   * Can only be done before any confirmations
   */
  async cancelEscrow(
    escrowId: string,
    userId: string,
  ): Promise<EscrowTransaction> {
    const escrow = await this.escrowRepo.findOne({
      where: { id: escrowId },
    });

    if (!escrow) {
      throw new NotFoundException('Escrow transaction not found');
    }

    // Only buyer or seller can cancel
    if (escrow.buyerId !== userId && escrow.sellerId !== userId) {
      throw new ForbiddenException('You are not part of this transaction');
    }

    // Can only cancel if still pending
    if (escrow.status !== EscrowStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel escrow. Status is: ${escrow.status}`,
      );
    }

    // Refund buyer
    await this.walletService.refundFunds(
      escrow.buyerId,
      escrow.totalAmount,
      `ESCROW_CANCEL_${escrow.id}`,
    );

    escrow.status = EscrowStatus.CANCELLED;
    escrow.refundedAt = new Date();

    const updated = await this.escrowRepo.save(escrow);

    // Release listing reservation
    await this.listingRepo.update(escrow.listingId, {
      status: ListingStatus.ACTIVE,
    });

    this.logger.log(`Escrow ${escrowId} cancelled, funds refunded to buyer`);

    return updated;
  }

  /**
   * Open a dispute for an escrow transaction
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

    // Can only dispute active escrows
    if ([EscrowStatus.COMPLETED, EscrowStatus.REFUNDED, EscrowStatus.CANCELLED].includes(escrow.status)) {
      throw new BadRequestException('Cannot dispute a completed or cancelled escrow');
    }

    // Check for existing dispute
    const existingDispute = await this.disputeRepo.findOne({
      where: { escrowId, status: DisputeStatus.OPEN },
    });

    if (existingDispute) {
      throw new BadRequestException('A dispute is already open for this transaction');
    }

    // Create dispute
    const dispute = this.disputeRepo.create({
      escrowId,
      openedById: userId,
      reason: dto.reason,
      description: dto.description,
      evidence: dto.evidence || null,
      status: DisputeStatus.OPEN,
    });

    const savedDispute = await this.disputeRepo.save(dispute);

    // Update escrow status
    escrow.status = EscrowStatus.DISPUTED;
    await this.escrowRepo.save(escrow);

    this.logger.log(`Dispute ${savedDispute.id} opened for escrow ${escrowId}`);

    return savedDispute;
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

    if (![DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW].includes(dispute.status)) {
      throw new BadRequestException('Dispute is already resolved');
    }

    const escrow = dispute.escrow;

    // Validate resolution amounts
    if (dto.resolution === DisputeStatus.RESOLVED_SPLIT) {
      if (!dto.buyerRefundAmount && !dto.sellerReleaseAmount) {
        throw new BadRequestException(
          'Please specify refund/release amounts for split resolution',
        );
      }
      const total = (dto.buyerRefundAmount || 0) + (dto.sellerReleaseAmount || 0);
      if (total > escrow.totalAmount) {
        throw new BadRequestException('Total exceeds escrow amount');
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Handle resolution
      switch (dto.resolution) {
        case DisputeStatus.RESOLVED_BUYER:
          // Full refund to buyer
          await this.walletService.refundFunds(
            escrow.buyerId,
            escrow.totalAmount,
            `DISPUTE_REFUND_${dispute.id}`,
          );
          dispute.buyerRefundAmount = escrow.totalAmount;
          escrow.status = EscrowStatus.REFUNDED;
          escrow.refundedAt = new Date();
          break;

        case DisputeStatus.RESOLVED_SELLER:
          // Release to seller
          await this.walletService.releaseFunds(
            escrow.buyerId,
            escrow.sellerId,
            escrow.amount,
            `DISPUTE_RELEASE_${dispute.id}`,
          );
          dispute.sellerReleaseAmount = escrow.amount;
          escrow.status = EscrowStatus.COMPLETED;
          escrow.releasedAt = new Date();
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
        status: dto.resolution === DisputeStatus.RESOLVED_BUYER
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
  async getEscrow(escrowId: string, userId: string): Promise<EscrowTransaction> {
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
    let where: { buyerId: string } | { sellerId: string } | Array<{ buyerId: string } | { sellerId: string }>;

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
      relations: ['escrow', 'escrow.buyer', 'escrow.seller', 'openedBy', 'resolvedBy'],
    });

    if (!dispute) {
      throw new NotFoundException('Dispute not found');
    }

    return dispute;
  }
}
