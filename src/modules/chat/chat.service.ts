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
import { User } from '../../database/entities/user.entity';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createConversation(
    userId: string,
    dto: CreateConversationDto,
  ): Promise<Conversation> {
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
    let sellerId: string | null = null;

    // If this is a listing inquiry, validate the listing
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
      sellerId = listing.sellerId;

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
    } else {
      // For direct messages, check if conversation already exists
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
      type: dto.type || ConversationType.LISTING_INQUIRY,
      listingId,
      buyerId: listingId ? userId : null,
      participant1Id: userId,
      participant2Id: dto.recipientId,
    });

    const savedConversation = await this.conversationRepository.save(conversation);
    return this.getConversationById(savedConversation.id, userId);
  }

  async startConversationWithMessage(
    userId: string,
    dto: StartConversationWithMessageDto,
  ): Promise<{ conversation: Conversation; message: Message }> {
    // Create or get conversation
    const conversationDto: CreateConversationDto = {
      type: dto.listingId
        ? ConversationType.LISTING_INQUIRY
        : ConversationType.DIRECT_MESSAGE,
      listingId: dto.listingId,
      recipientId: dto.recipientId,
    };

    const conversation = await this.createConversation(userId, conversationDto);

    // Send the first message
    const message = await this.sendMessage(userId, {
      conversationId: conversation.id,
      content: dto.content,
      attachments: dto.attachments,
    });

    return {
      conversation: await this.getConversationById(conversation.id, userId),
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
      relations: ['participant1', 'participant2', 'listing', 'listing.images'],
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
