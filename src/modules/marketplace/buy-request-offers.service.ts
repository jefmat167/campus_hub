import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan, Not } from 'typeorm';
import {
  BuyRequestOffer,
  BuyRequestOfferStatus,
} from '../../database/entities/buy-request-offer.entity';
import {
  BuyRequest,
  BuyRequestStatus,
} from '../../database/entities/buy-request.entity';
import {
  Conversation,
  ConversationType,
} from '../../database/entities/conversation.entity';
import { User } from '../../database/entities/user.entity';
import { ChatService } from '../chat/chat.service';
import { EscrowService } from '../escrow/escrow.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import {
  CreateBuyRequestOfferDto,
  RespondBuyRequestOfferDto,
  BuyRequestOfferResponseAction,
} from './dto';

@Injectable()
export class BuyRequestOffersService {
  constructor(
    @InjectRepository(BuyRequestOffer)
    private readonly offerRepository: Repository<BuyRequestOffer>,
    @InjectRepository(BuyRequest)
    private readonly buyRequestRepository: Repository<BuyRequest>,
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly chatService: ChatService,
    private readonly escrowService: EscrowService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
  ) { }

  private sanitizeUser(user: User): Record<string, any> {
    if (!user) return user;
    return {
      id: user.id,
      fullName: user.fullName,
      profilePhotoUrl: user.profilePhotoUrl,
      verificationTier: user.verificationTier,
    };
  }

  async createOffer(
    userId: string,
    buyRequestId: string,
    dto: CreateBuyRequestOfferDto,
  ): Promise<BuyRequestOffer> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const buyRequest = await this.buyRequestRepository.findOne({
      where: { id: buyRequestId },
      relations: ['requester'],
    });

    if (!buyRequest) {
      throw new NotFoundException('Buy request not found');
    }

    if (buyRequest.status !== BuyRequestStatus.OPEN) {
      throw new BadRequestException('This buy request is no longer accepting offers');
    }

    if (buyRequest.requesterId === userId) {
      throw new ForbiddenException('You cannot make an offer on your own buy request');
    }

    const existingOffer = await this.offerRepository.findOne({
      where: {
        buyRequestId,
        responderId: userId,
        status: BuyRequestOfferStatus.PENDING,
      },
    });

    if (existingOffer) {
      throw new ConflictException('You already have a pending offer on this buy request');
    }

    // Validate proposed price is within budget range
    // if (dto.proposedPrice < buyRequest.budgetMin) {
    //   throw new BadRequestException(
    //     `Proposed price must be at least ₦${Number(buyRequest.budgetMin).toLocaleString()}`,
    //   );
    // }
    if (buyRequest.budgetMax && dto.proposedPrice > Number(buyRequest.budgetMax)) {
      throw new BadRequestException(
        `Proposed price exceeds maximum budget of ₦${Number(buyRequest.budgetMax).toLocaleString()}`,
      );
    }

    const conversation = await this.createBuyRequestConversation(
      user,
      buyRequest.requesterId,
      buyRequestId,
    );

    // Offer expires in 48 hours
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const offer = this.offerRepository.create({
      buyRequestId,
      responderId: userId,
      requesterId: buyRequest.requesterId,
      proposedPrice: dto.proposedPrice,
      itemCondition: dto.itemCondition,
      message: dto.message || null,
      imageUrls: dto.imageUrls?.length ? dto.imageUrls : null,
      status: BuyRequestOfferStatus.PENDING,
      expiresAt,
      conversationId: conversation.id,
    });

    const savedOffer = await this.offerRepository.save(offer);

    // Notify the buyer (requester) about the new offer
    await this.notificationsService.createNotification({
      userId: buyRequest.requesterId,
      type: NotificationType.OFFER_RECEIVED,
      title: 'You have a new offer',
      body: `${user.fullName} offered ₦${dto.proposedPrice.toLocaleString()} (${dto.itemCondition.replace('_', ' ')}) on "${buyRequest.title}"`,
      data: {
        offerId: savedOffer.id,
        buyRequestId,
        proposedPrice: dto.proposedPrice,
        responderId: userId,
      },
    });

    // Send initial message in conversation if message provided
    if (dto.message) {
      const messageContent = `[Offer: ₦${dto.proposedPrice.toLocaleString()} - ${dto.itemCondition.replace('_', ' ')}]\n\n${dto.message}`;
      await this.chatService.sendMessage(userId, {
        conversationId: conversation.id,
        content: messageContent,
        attachments: dto.imageUrls?.length ? dto.imageUrls : undefined,
      });
    }

    return this.getOfferById(savedOffer.id, userId);
  }

  private async createBuyRequestConversation(
    user: User,
    requesterId: string,
    buyRequestId: string,
  ): Promise<Conversation> {
    // Check for existing conversation
    const existing = await this.conversationRepository.findOne({
      where: {
        buyRequestId,
        buyerId: user.id, // buyerId represents the responder in BUY_REQUEST_INQUIRY
      },
    });

    if (existing) {
      return existing;
    }

    // Create new conversation
    const conversation = this.conversationRepository.create({
      type: ConversationType.BUY_REQUEST_INQUIRY,
      buyRequestId,
      buyerId: user.id, // The responder (seller) initiates the conversation
      participant1Id: user.id,
      participant2Id: requesterId,
    });

    return this.conversationRepository.save(conversation);
  }

  async respondToOffer(
    offerId: string,
    userId: string,
    dto: RespondBuyRequestOfferDto,
  ): Promise<BuyRequestOffer> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
      relations: ['buyRequest', 'responder', 'requester'],
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    // Only the requester can respond to offers
    if (offer.requesterId !== userId) {
      throw new ForbiddenException('Only the requester can respond to this offer');
    }

    if (offer.status !== BuyRequestOfferStatus.PENDING) {
      throw new BadRequestException(`Cannot respond to an offer with status: ${offer.status}`);
    }

    // Check if offer has expired
    if (new Date() > offer.expiresAt) {
      await this.offerRepository.update(offerId, {
        status: BuyRequestOfferStatus.EXPIRED,
      });
      throw new BadRequestException('This offer has expired');
    }

    const now = new Date();

    if (dto.action === BuyRequestOfferResponseAction.ACCEPT) {
      await this.acceptOffer(offer, now);
    } else {
      await this.offerRepository.update(offerId, {
        status: BuyRequestOfferStatus.REJECTED,
        respondedAt: now,
      });

      // Send system message about rejection
      if (offer.conversationId) {
        const rejectMessage = dto.message
          ? `Offer declined: ${dto.message}`
          : 'Offer declined.';
        await this.chatService.sendSystemMessage(
          offer.conversationId,
          rejectMessage,
          { type: 'offer_rejected', offerId: offer.id },
        );
      }
    }

    return this.getOfferById(offerId, userId);
  }

  private async acceptOffer(offer: BuyRequestOffer, respondedAt: Date): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Mark offer as accepted and buy request as fulfilled
      await queryRunner.manager.update(BuyRequestOffer, offer.id, {
        status: BuyRequestOfferStatus.ACCEPTED,
        respondedAt,
      });
      await queryRunner.manager.update(BuyRequest, offer.buyRequestId, {
        status: BuyRequestStatus.FULFILLED,
      });

      // Initiate escrow within the same transaction — no orphans
      await this.escrowService.initiateEscrowFromOffer(
        offer.requesterId,
        offer,
        queryRunner,
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Reject all other pending offers (outside transaction — non-critical)
    const otherPendingOffers = await this.offerRepository.find({
      where: {
        buyRequestId: offer.buyRequestId,
        id: Not(offer.id),
        status: BuyRequestOfferStatus.PENDING,
      },
    });

    if (otherPendingOffers.length > 0) {
      await this.offerRepository.update(
        {
          buyRequestId: offer.buyRequestId,
          id: Not(offer.id),
          status: BuyRequestOfferStatus.PENDING,
        },
        {
          status: BuyRequestOfferStatus.REJECTED,
        },
      );

      // Send rejection notification to other responders in parallel
      const systemMessages = otherPendingOffers
        .filter((o) => o.conversationId)
        .map((rejectedOffer) =>
          this.chatService.sendSystemMessage(
            rejectedOffer.conversationId!,
            'This buy request has been fulfilled with another offer.',
            { type: 'request_fulfilled', offerId: rejectedOffer.id },
          ),
        );
      await Promise.all(systemMessages);
    }
  }

  async withdrawOffer(offerId: string, userId: string): Promise<void> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    // Only the responder can withdraw their offer
    if (offer.responderId !== userId) {
      throw new ForbiddenException('Only the responder can withdraw this offer');
    }

    if (offer.status !== BuyRequestOfferStatus.PENDING) {
      throw new BadRequestException(`Cannot withdraw an offer with status: ${offer.status}`);
    }

    await this.offerRepository.update(offerId, {
      status: BuyRequestOfferStatus.WITHDRAWN,
    });

    // Send system message about withdrawal
    if (offer.conversationId) {
      await this.chatService.sendSystemMessage(
        offer.conversationId,
        'This offer has been withdrawn.',
        { type: 'offer_withdrawn', offerId: offer.id },
      );
    }
  }

  async getOfferById(offerId: string, userId: string): Promise<BuyRequestOffer> {
    const offer = await this.offerRepository.findOne({
      where: { id: offerId },
      relations: ['buyRequest', 'responder', 'requester'],
    });

    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    // Only responder or requester can view the offer
    if (offer.responderId !== userId && offer.requesterId !== userId) {
      throw new ForbiddenException('You do not have access to this offer');
    }

    // Sanitize user data
    if (offer.responder) {
      (offer as any).responder = this.sanitizeUser(offer.responder);
    }
    if (offer.requester) {
      (offer as any).requester = this.sanitizeUser(offer.requester);
    }

    return offer;
  }

  async getOffersForRequest(
    buyRequestId: string,
    userId: string,
    status?: BuyRequestOfferStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    offers: BuyRequestOffer[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const buyRequest = await this.buyRequestRepository.findOne({
      where: { id: buyRequestId },
    });

    if (!buyRequest) {
      throw new NotFoundException('Buy request not found');
    }

    // Only requester can view all offers for their request
    if (buyRequest.requesterId !== userId) {
      throw new ForbiddenException('Only the requester can view offers for this request');
    }

    const whereClause: any = { buyRequestId };
    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const [offers, total] = await this.offerRepository.findAndCount({
      where: whereClause,
      relations: ['responder'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    // Sanitize responder data
    offers.forEach((offer) => {
      if (offer.responder) {
        (offer as any).responder = this.sanitizeUser(offer.responder);
      }
    });

    return {
      offers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getResponderOffers(
    userId: string,
    status?: BuyRequestOfferStatus,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    offers: BuyRequestOffer[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const whereClause: any = { responderId: userId };
    if (status) {
      whereClause.status = status;
    }

    const offset = (page - 1) * limit;

    const [offers, total] = await this.offerRepository.findAndCount({
      where: whereClause,
      relations: ['buyRequest', 'requester'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    // Sanitize requester data
    offers.forEach((offer) => {
      if (offer.requester) {
        (offer as any).requester = this.sanitizeUser(offer.requester);
      }
    });

    return {
      offers,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }


  async markExpiredOffers(): Promise<number> {
    const result = await this.offerRepository.update(
      {
        status: BuyRequestOfferStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      {
        status: BuyRequestOfferStatus.EXPIRED,
      },
    );

    return result.affected || 0;
  }
}
