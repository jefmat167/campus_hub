import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import {
  Conversation,
  Message,
  ConversationType,
} from '../../database/entities/conversation.entity';
import { Listing } from '../../database/entities/listing.entity';
import { HousingListing } from '../../database/entities/housing.entity';
import { HousingService } from '../housing/housing.service';
import { BuyRequest } from '../../database/entities/buy-request.entity';
import { RoommateProfile, RoommateProfileStatus } from '../../database/entities/roommate.entity';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { tierMeetsRequirement } from '../../common/decorators/min-tier.decorator';
import {
  CreateConversationDto,
  SendMessageDto,
  StartConversationWithMessageDto,
} from './dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
    @InjectRepository(HousingListing)
    private readonly housingListingRepository: Repository<HousingListing>,
    @InjectRepository(BuyRequest)
    private readonly buyRequestRepository: Repository<BuyRequest>,
    @InjectRepository(RoommateProfile)
    private readonly roommateProfileRepository: Repository<RoommateProfile>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly housingService: HousingService,
  ) {}

  async createConversation(
    user: User,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
    const userId = user.id;

    // Validate mutual exclusivity
    const listingTypes = [dto.listingId, dto.housingListingId, dto.buyRequestId, dto.roommateProfileId].filter(Boolean);
    if (listingTypes.length > 1) {
      throw new BadRequestException(
        'Cannot specify multiple listing types (listingId, housingListingId, buyRequestId, roommateProfileId)',
      );
    }

    // Check if recipient exists
    const recipient = await this.userRepository.findOne({
      where: { id: dto.recipientId },
    });

    if (!recipient) {
      throw new NotFoundException('Recipient not found');
    }

    // Prevent conversation with self
    if (userId === dto.recipientId) {
      throw new BadRequestException('Cannot start conversation with yourself');
    }

    let listingId: string | null = null;
    let housingListingId: string | null = null;
    let buyRequestId: string | null = null;
    let roommateProfileId: string | null = null;
    let conversationType: ConversationType = ConversationType.DIRECT_MESSAGE;

    // Handle marketplace listing inquiry
    if (dto.listingId) {
      const listing = await this.listingRepository.findOne({
        where: { id: dto.listingId },
      });

      if (!listing) {
        throw new NotFoundException('Listing not found');
      }

      // The recipient should be the seller
      if (listing.sellerId !== dto.recipientId) {
        throw new BadRequestException('Recipient must be the listing seller');
      }

      listingId = dto.listingId;
      conversationType = ConversationType.LISTING_INQUIRY;

      // Check for existing conversation for this listing
      const existingConversation = await this.conversationRepository.findOne({
        where: {
          listingId: dto.listingId,
          buyerId: userId,
        },
      });

      if (existingConversation) {
        return this.getConversationById(existingConversation.id, userId);
      }
    }
    // Handle housing listing inquiry
    else if (dto.housingListingId) {
      // Check tier requirement for housing inquiries
      if (!tierMeetsRequirement(user.verificationTier, VerificationTier.TIER_0)) {
        throw new ForbiddenException({
          message: 'You must verify your phone and email before inquiring about housing listings',
          requiredTier: VerificationTier.TIER_0,
          currentTier: user.verificationTier,
          upgradeRequired: true,
        });
      }

      const housingListing = await this.housingListingRepository.findOne({
        where: { id: dto.housingListingId },
      });

      if (!housingListing) {
        throw new NotFoundException('Housing listing not found');
      }

      // The recipient should be the poster (student who listed it)
      if (housingListing.posterId !== dto.recipientId) {
        throw new BadRequestException('Recipient must be the listing poster');
      }

      housingListingId = dto.housingListingId;
      conversationType = ConversationType.HOUSING_INQUIRY;

      // Check for existing conversation for this housing listing
      const existingConversation = await this.conversationRepository.findOne({
        where: {
          housingListingId: dto.housingListingId,
          buyerId: userId,
        },
      });

      if (existingConversation) {
        return this.getConversationById(existingConversation.id, userId);
      }

      // New inquiry — bump the listing's inquiry counter. Kept out of the
      // save path below so it only fires once per (tenant, listing) pair
      // (the existingConversation short-circuit above handles dedup).
      await this.housingService.incrementInquiry(dto.housingListingId);
    }
    // Handle buy request inquiry (seller responding to a buy request)
    else if (dto.buyRequestId) {
      const buyRequest = await this.buyRequestRepository.findOne({
        where: { id: dto.buyRequestId },
      });

      if (!buyRequest) {
        throw new NotFoundException('Buy request not found');
      }

      // The recipient should be the requester (owner of buy request)
      if (buyRequest.requesterId !== dto.recipientId) {
        throw new BadRequestException('Recipient must be the buy request owner');
      }

      buyRequestId = dto.buyRequestId;
      conversationType = ConversationType.BUY_REQUEST_INQUIRY;

      // Check for existing conversation for this buy request
      // buyerId represents the responder (seller) in BUY_REQUEST_INQUIRY
      const existingConversation = await this.conversationRepository.findOne({
        where: {
          buyRequestId: dto.buyRequestId,
          buyerId: userId,
        },
      });

      if (existingConversation) {
        return this.getConversationById(existingConversation.id, userId);
      }
    }
    // Handle roommate profile inquiry
    else if (dto.roommateProfileId) {
      // Check tier requirement for roommate inquiries
      if (!tierMeetsRequirement(user.verificationTier, VerificationTier.TIER_1)) {
        throw new ForbiddenException({
          message: 'You must complete student verification to inquire about roommate profiles',
          requiredTier: VerificationTier.TIER_1,
          currentTier: user.verificationTier,
          upgradeRequired: true,
        });
      }

      const roommateProfile = await this.roommateProfileRepository.findOne({
        where: { id: dto.roommateProfileId },
      });

      if (!roommateProfile) {
        throw new NotFoundException('Roommate profile not found');
      }

      // Check profile is active
      if (roommateProfile.status !== RoommateProfileStatus.ACTIVE) {
        throw new BadRequestException('Roommate profile is not active');
      }

      // Check same university
      if (roommateProfile.universityId !== user.universityId) {
        throw new ForbiddenException('You can only inquire about roommate profiles within your university');
      }

      // The recipient should be the profile owner
      if (roommateProfile.userId !== dto.recipientId) {
        throw new BadRequestException('Recipient must be the roommate profile owner');
      }

      roommateProfileId = dto.roommateProfileId;
      conversationType = ConversationType.ROOMMATE_INQUIRY;

      // Check for existing conversation for this roommate profile
      const existingConversation = await this.conversationRepository.findOne({
        where: {
          roommateProfileId: dto.roommateProfileId,
          buyerId: userId,
        },
      });

      if (existingConversation) {
        return this.getConversationById(existingConversation.id, userId);
      }
    }
    // Handle direct message
    else {
      const existingConversation = await this.conversationRepository
        .createQueryBuilder('conv')
        .where('conv.type = :type', { type: ConversationType.DIRECT_MESSAGE })
        .andWhere(
          new Brackets((qb) => {
            qb.where(
              'conv.participant1Id = :user1 AND conv.participant2Id = :user2',
              { user1: userId, user2: dto.recipientId },
            ).orWhere(
              'conv.participant1Id = :user2 AND conv.participant2Id = :user1',
              { user1: userId, user2: dto.recipientId },
            );
          }),
        )
        .getOne();

      if (existingConversation) {
        return this.getConversationById(existingConversation.id, userId);
      }
    }

    const conversation = this.conversationRepository.create({
      type: dto.type || conversationType,
      listingId,
      housingListingId,
      buyRequestId,
      roommateProfileId,
      buyerId: listingId || housingListingId || buyRequestId || roommateProfileId ? userId : null,
      participant1Id: userId,
      participant2Id: dto.recipientId,
    });

    const savedConversation = await this.conversationRepository.save(conversation);
    return this.getConversationById(savedConversation.id, userId);
  }

  async startConversationWithMessage(
    user: User,
    dto: StartConversationWithMessageDto,
  ): Promise<{ conversation: Conversation; message: Message }> {
    // Determine conversation type based on provided listing
    let type: ConversationType = ConversationType.DIRECT_MESSAGE;
    if (dto.listingId) {
      type = ConversationType.LISTING_INQUIRY;
    } else if (dto.housingListingId) {
      type = ConversationType.HOUSING_INQUIRY;
    } else if (dto.buyRequestId) {
      type = ConversationType.BUY_REQUEST_INQUIRY;
    } else if (dto.roommateProfileId) {
      type = ConversationType.ROOMMATE_INQUIRY;
    }

    // Create or get conversation
    const conversationDto: CreateConversationDto = {
      type,
      listingId: dto.listingId,
      housingListingId: dto.housingListingId,
      buyRequestId: dto.buyRequestId,
      roommateProfileId: dto.roommateProfileId,
      recipientId: dto.recipientId,
    };

    const conversation = await this.createConversation(user, conversationDto);

    // Send the first message
    const message = await this.sendMessage(user.id, {
      conversationId: conversation.id,
      content: dto.content,
      attachments: dto.attachments,
    });

    return {
      conversation: await this.getConversationById(conversation.id, user.id),
      message,
    };
  }

  async sendMessage(userId: string, dto: SendMessageDto): Promise<Message> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: dto.conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Check if user is a participant
    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    // Check if the conversation was deleted by this user
    if (
      (conversation.participant1Id === userId && conversation.isDeletedByParticipant1) ||
      (conversation.participant2Id === userId && conversation.isDeletedByParticipant2)
    ) {
      // Restore the conversation for this user
      if (conversation.participant1Id === userId) {
        await this.conversationRepository.update(conversation.id, {
          isDeletedByParticipant1: false,
        });
      } else {
        await this.conversationRepository.update(conversation.id, {
          isDeletedByParticipant2: false,
        });
      }
    }

    const message = this.messageRepository.create({
      conversationId: dto.conversationId,
      senderId: userId,
      content: dto.content,
      attachments: dto.attachments || null,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update conversation with last message info
    const updateFields: Record<string, unknown> = {
      lastMessagePreview:
        dto.content.length > 100
          ? dto.content.substring(0, 100) + '...'
          : dto.content,
      lastMessageAt: new Date(),
      lastMessageSenderId: userId,
    };

    // Increment unread count for recipient
    if (conversation.participant1Id === userId) {
      updateFields.participant2UnreadCount = conversation.participant2UnreadCount + 1;
    } else {
      updateFields.participant1UnreadCount = conversation.participant1UnreadCount + 1;
    }

    await this.conversationRepository.update(dto.conversationId, updateFields);

    return this.getMessageById(savedMessage.id);
  }

  async getConversationById(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
      relations: ['participant1', 'participant2', 'listing', 'listing.images', 'housingListing', 'buyRequest', 'roommateProfile'],
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    // Check if user is a participant
    if (
      conversation.participant1Id !== userId &&
      conversation.participant2Id !== userId
    ) {
      throw new ForbiddenException('You are not a participant in this conversation');
    }

    // Add unread count for current user
    (conversation as any).unreadCount =
      conversation.participant1Id === userId
        ? conversation.participant1UnreadCount
        : conversation.participant2UnreadCount;

    // Add other participant info
    (conversation as any).otherParticipant =
      conversation.participant1Id === userId
        ? conversation.participant2
        : conversation.participant1;

    return conversation;
  }

  async getUserConversations(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{
    conversations: Conversation[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const offset = (page - 1) * limit;

    const [conversations, total] = await this.conversationRepository
      .createQueryBuilder('conv')
      .leftJoinAndSelect('conv.participant1', 'p1')
      .leftJoinAndSelect('conv.participant2', 'p2')
      .leftJoinAndSelect('conv.listing', 'listing')
      .leftJoinAndSelect('listing.images', 'images')
      .leftJoinAndSelect('conv.housingListing', 'housingListing')
      .where(
        new Brackets((qb) => {
          qb.where(
            'conv.participant1Id = :userId AND conv.isDeletedByParticipant1 = false',
            { userId },
          ).orWhere(
            'conv.participant2Id = :userId AND conv.isDeletedByParticipant2 = false',
            { userId },
          );
        }),
      )
      .orderBy('conv.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('conv.createdAt', 'DESC')
      .skip(offset)
      .take(limit)
      .getManyAndCount();

    // Add unread counts and other participant info
    conversations.forEach((conv) => {
      (conv as any).unreadCount =
        conv.participant1Id === userId
          ? conv.participant1UnreadCount
          : conv.participant2UnreadCount;
      (conv as any).otherParticipant =
        conv.participant1Id === userId ? conv.participant2 : conv.participant1;
    });

    const totalPages = Math.ceil(total / limit);

    return {
      conversations,
      total,
      page,
      totalPages,
    };
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{
    messages: Message[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    // Verify user is a participant
    await this.getConversationById(conversationId, userId);

    const offset = (page - 1) * limit;

    const [messages, total] = await this.messageRepository.findAndCount({
      where: { conversationId },
      relations: ['sender'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      messages: messages.reverse(), // Return in chronological order
      total,
      page,
      totalPages,
    };
  }

  async markMessagesAsRead(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId, userId);

    // Mark all unread messages from the other participant as read
    const otherParticipantId =
      conversation.participant1Id === userId
        ? conversation.participant2Id
        : conversation.participant1Id;

    await this.messageRepository.update(
      {
        conversationId,
        senderId: otherParticipantId,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      },
    );

    // Reset unread count for this user
    if (conversation.participant1Id === userId) {
      await this.conversationRepository.update(conversationId, {
        participant1UnreadCount: 0,
      });
    } else {
      await this.conversationRepository.update(conversationId, {
        participant2UnreadCount: 0,
      });
    }
  }

  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.getConversationById(conversationId, userId);

    // Soft delete for this user
    if (conversation.participant1Id === userId) {
      await this.conversationRepository.update(conversationId, {
        isDeletedByParticipant1: true,
      });
    } else {
      await this.conversationRepository.update(conversationId, {
        isDeletedByParticipant2: true,
      });
    }
  }

  async getMessageById(messageId: string): Promise<Message> {
    const message = await this.messageRepository.findOne({
      where: { id: messageId },
      relations: ['sender'],
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    return message;
  }

  async getTotalUnreadCount(userId: string): Promise<number> {
    const result = await this.conversationRepository
      .createQueryBuilder('conv')
      .select(
        `COALESCE(
          SUM(
            CASE
              WHEN conv.participant1_id = :userId AND conv."isDeletedByParticipant1" = false
                THEN conv."participant1UnreadCount"
              WHEN conv.participant2_id = :userId AND conv."isDeletedByParticipant2" = false
                THEN conv."participant2UnreadCount"
              ELSE 0
            END
          ), 0
        )`,
        'total',
      )
      .where(
        new Brackets((qb) => {
          qb.where('conv.participant1_id = :userId', { userId }).orWhere(
            'conv.participant2_id = :userId',
            { userId },
          );
        }),
      )
      .setParameter('userId', userId)
      .getRawOne();

    return parseInt(result.total, 10) || 0;
  }

  // For sending system messages (e.g., offer accepted)
  async sendSystemMessage(
    conversationId: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<Message> {
    const message = this.messageRepository.create({
      conversationId,
      senderId: null as any, // System message has no sender
      content,
      isSystemMessage: true,
      metadata,
    });

    const savedMessage = await this.messageRepository.save(message);

    // Update conversation
    await this.conversationRepository.update(conversationId, {
      lastMessagePreview: content,
      lastMessageAt: new Date(),
      lastMessageSenderId: null,
    });

    return savedMessage;
  }
}
