import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  LessThan,
  Not,
} from 'typeorm';
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
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import { ChatService } from '../chat/chat.service';
import { EscrowService } from '../escrow/escrow.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../../database/entities/notification.entity';
import { TransactionPinService } from '../transaction-pin/transaction-pin.service';
import {
  CreateBuyRequestOfferDto,
  RespondBuyRequestOfferDto,
  BuyRequestOfferResponseAction,
} from './dto';

/** How long a buy-request offer waits for the requester before it expires. */
export const BUY_REQUEST_OFFER_EXPIRY_DAYS = 7;

/** Copy for the responders whose offers lost (auto-rejected). */
export interface RejectedOffersCopy {
  chatText: string;
  chatType: string;
  title: string;
  body: (offer: BuyRequestOffer) => string;
}

@Injectable()
export class BuyRequestOffersService {
  private readonly logger = new Logger(BuyRequestOffersService.name);

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
    private readonly transactionPinService: TransactionPinService,
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

    // Budget cap: the range's max, or — for a fixed budget (no max) — the
    // stated budget itself. Cheaper is always welcome, so there is no floor.
    const budgetCap = Number(buyRequest.budgetMax ?? buyRequest.budgetMin);
    if (dto.proposedPrice > budgetCap) {
      throw new BadRequestException(
        `Proposed price exceeds the ${buyRequest.budgetMax ? 'maximum ' : ''}budget of ₦${budgetCap.toLocaleString()}`,
      );
    }

    // A requester gets a week to respond (listing offers, by contrast, expire
    // in 48h — a seller is expected to answer a price quickly; a shopper
    // browsing offers on their own request is not).
    const expiresAt = new Date(
      Date.now() + BUY_REQUEST_OFFER_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    // Conversation + offer land together — never a thread without its offer.
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let conversation: Conversation;
    let savedOffer: BuyRequestOffer;
    try {
      conversation = await this.createBuyRequestConversation(
        user,
        buyRequest.requesterId,
        buyRequestId,
        queryRunner.manager,
      );

      savedOffer = await queryRunner.manager.save(
        queryRunner.manager.create(BuyRequestOffer, {
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
        }),
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Post-commit side effects — the offer exists; a lost message must not 500 it.
    try {
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
    } catch (error) {
      this.logger.warn(
        `Failed to notify requester ${buyRequest.requesterId} about offer ${savedOffer.id}: ${error}`,
      );
    }

    if (dto.message) {
      try {
        const messageContent = `[Offer: ₦${dto.proposedPrice.toLocaleString()} - ${dto.itemCondition.replace('_', ' ')}]\n\n${dto.message}`;
        await this.chatService.sendMessage(userId, {
          conversationId: conversation.id,
          content: messageContent,
          attachments: dto.imageUrls?.length ? dto.imageUrls : undefined,
        });
      } catch (error) {
        this.logger.warn(
          `Failed to post the opening message for offer ${savedOffer.id} in conversation ${conversation.id}: ${error}`,
        );
      }
    }

    return this.getOfferById(savedOffer.id, userId);
  }

  private async createBuyRequestConversation(
    user: User,
    requesterId: string,
    buyRequestId: string,
    manager: EntityManager,
  ): Promise<Conversation> {
    // Check for existing conversation
    const existing = await manager.findOne(Conversation, {
      where: {
        buyRequestId,
        buyerId: user.id, // buyerId represents the responder in BUY_REQUEST_INQUIRY
      },
    });

    if (existing) {
      return existing;
    }

    // Create new conversation
    return manager.save(
      manager.create(Conversation, {
        type: ConversationType.BUY_REQUEST_INQUIRY,
        buyRequestId,
        buyerId: user.id, // The responder (seller) initiates the conversation
        participant1Id: user.id,
        participant2Id: requesterId,
      }),
    );
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
      // A cancelled / already-fulfilled request can't be bought into. The
      // conditional flip inside acceptOffer() is the authoritative check;
      // this is the friendly early answer.
      if (offer.buyRequest && offer.buyRequest.status !== BuyRequestStatus.OPEN) {
        throw new BadRequestException(
          `This buy request is ${offer.buyRequest.status} — its offers can no longer be accepted`,
        );
      }

      // Accepting locks the requester's (buyer's) funds → require the PIN.
      await this.transactionPinService.verifyForTransaction(userId, dto.pin);
      await this.acceptOffer(offer, now);
    } else {
      await this.offerRepository.update(offerId, {
        status: BuyRequestOfferStatus.REJECTED,
        respondedAt: now,
      });

      // Tell the responder: system line in the thread + notification
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
      await this.notificationsService.createNotification({
        userId: offer.responderId,
        type: NotificationType.OFFER_REJECTED,
        title: 'Your offer was declined',
        body: `The requester declined your offer on "${offer.buyRequest?.title ?? 'a buy request'}".`,
        data: { offerId: offer.id, buyRequestId: offer.buyRequestId },
      });
    }

    return this.getOfferById(offerId, userId);
  }

  /**
   * Accept = ONE transaction: request OPEN→FULFILLED, offer PENDING→ACCEPTED,
   * every sibling PENDING→REJECTED, escrow created + funds locked. The two
   * conditional flips are what make it safe: their WHERE clauses fail (0 rows)
   * if the request was cancelled/fulfilled meanwhile or the offer already
   * decided, and the row locks they take serialise concurrent accepts — so
   * two offers on one request can never both win. Losers are notified only
   * after commit.
   */
  private async acceptOffer(offer: BuyRequestOffer, respondedAt: Date): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let rejectedSiblings: BuyRequestOffer[] = [];
    let escrow: EscrowTransaction;
    try {
      const manager = queryRunner.manager;

      const requestFlip = await manager.update(
        BuyRequest,
        { id: offer.buyRequestId, status: BuyRequestStatus.OPEN },
        { status: BuyRequestStatus.FULFILLED },
      );
      if (!requestFlip.affected) {
        throw new ConflictException('This buy request is no longer open');
      }

      const offerFlip = await manager.update(
        BuyRequestOffer,
        { id: offer.id, status: BuyRequestOfferStatus.PENDING },
        { status: BuyRequestOfferStatus.ACCEPTED, respondedAt },
      );
      if (!offerFlip.affected) {
        throw new ConflictException('This offer is no longer pending');
      }

      rejectedSiblings = await this.rejectPendingOffersForRequest(
        offer.buyRequestId,
        respondedAt,
        manager,
        offer.id,
      );

      // Initiate escrow within the same transaction — no orphans
      escrow = await this.escrowService.initiateEscrowFromOffer(
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

    // Post-commit only: deadline jobs, order notifications and emails for the
    // new escrow, then the losers. Nothing announces an order that could
    // still have rolled back.
    await this.escrowService.finalizeOfferEscrowPlacement(escrow, offer);

    await this.notifyOffersRejected(rejectedSiblings, {
      chatText: 'This buy request has been fulfilled with another offer.',
      chatType: 'request_fulfilled',
      title: 'Your offer was not selected',
      body: (o) =>
        `The requester accepted another offer on "${o.buyRequest?.title ?? 'a buy request'}".`,
    });
  }

  /**
   * Flip every PENDING offer on a request to REJECTED — optionally sparing one
   * (the winner) — on the CALLER's transaction, and return the affected rows
   * (with `buyRequest` loaded) so the caller can notify the losers after it
   * commits. Shared by accept (siblings lose), request cancel and manual
   * fulfil, so a closed request never keeps live offers.
   */
  async rejectPendingOffersForRequest(
    buyRequestId: string,
    respondedAt: Date,
    manager: EntityManager,
    exceptOfferId?: string,
  ): Promise<BuyRequestOffer[]> {
    const where: FindOptionsWhere<BuyRequestOffer> = {
      buyRequestId,
      status: BuyRequestOfferStatus.PENDING,
      ...(exceptOfferId ? { id: Not(exceptOfferId) } : {}),
    };

    const losers = await manager.find(BuyRequestOffer, {
      where,
      relations: ['buyRequest'],
    });
    if (losers.length === 0) return [];

    await manager.update(
      BuyRequestOffer,
      { id: In(losers.map((o) => o.id)), status: BuyRequestOfferStatus.PENDING },
      { status: BuyRequestOfferStatus.REJECTED, respondedAt },
    );

    return losers;
  }

  /**
   * Post-commit side effects for offers that lost: a system line in each
   * responder's thread + an in-app/push notification. Swallows failures — the
   * state change already happened; a lost message must not turn it into a 500.
   */
  async notifyOffersRejected(
    offers: BuyRequestOffer[],
    copy: RejectedOffersCopy,
  ): Promise<void> {
    await Promise.all(
      offers.map(async (offer) => {
        // The two channels are independent — a chat failure must not cost
        // the responder their push notification (or vice versa).
        try {
          await this.notificationsService.createNotification({
            userId: offer.responderId,
            type: NotificationType.OFFER_REJECTED,
            title: copy.title,
            body: copy.body(offer),
            data: { offerId: offer.id, buyRequestId: offer.buyRequestId },
          });
        } catch (error) {
          this.logger.warn(
            `Failed to notify responder ${offer.responderId} about rejected offer ${offer.id}: ${error}`,
          );
        }
        if (!offer.conversationId) return;
        try {
          await this.chatService.sendSystemMessage(
            offer.conversationId,
            copy.chatText,
            { type: copy.chatType, offerId: offer.id },
          );
        } catch (error) {
          this.logger.warn(
            `Failed to post system message for rejected offer ${offer.id} in conversation ${offer.conversationId}: ${error}`,
          );
        }
      }),
    );
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
    buyRequestId?: string,
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
    if (buyRequestId) {
      whereClause.buyRequestId = buyRequestId;
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


  /**
   * Flip every PENDING offer past its `expiresAt` to EXPIRED and tell the
   * responder (thread line + push). Runs from the `offers` queue every 15
   * minutes (`OffersProcessor`); respondToOffer still checks expiry lazily,
   * so the sweep cadence is never load-bearing.
   */
  async markExpiredOffers(): Promise<number> {
    const expired = await this.offerRepository.find({
      where: {
        status: BuyRequestOfferStatus.PENDING,
        expiresAt: LessThan(new Date()),
      },
      relations: ['buyRequest'],
    });
    if (expired.length === 0) return 0;

    const result = await this.offerRepository.update(
      { id: In(expired.map((o) => o.id)), status: BuyRequestOfferStatus.PENDING },
      { status: BuyRequestOfferStatus.EXPIRED },
    );

    await Promise.all(
      expired.map(async (offer) => {
        try {
          await this.notificationsService.createNotification({
            userId: offer.responderId,
            type: NotificationType.OFFER_EXPIRED,
            title: 'Your offer expired',
            body: `Your offer on "${offer.buyRequest?.title ?? 'a buy request'}" expired without a response.`,
            data: { offerId: offer.id, buyRequestId: offer.buyRequestId },
          });
        } catch (error) {
          this.logger.warn(
            `Failed to notify responder ${offer.responderId} about expired offer ${offer.id}: ${error}`,
          );
        }
        if (!offer.conversationId) return;
        try {
          await this.chatService.sendSystemMessage(
            offer.conversationId,
            'This offer has expired.',
            { type: 'offer_expired', offerId: offer.id },
          );
        } catch (error) {
          this.logger.warn(
            `Failed to post the expiry line for offer ${offer.id} in conversation ${offer.conversationId}: ${error}`,
          );
        }
      }),
    );

    return result.affected ?? expired.length;
  }
}
