import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { ChatService } from './chat.service';
import {
  CreateConversationDto,
  SendMessageDto,
  StartConversationWithMessageDto,
} from './dto';

@ApiTags('Chat')
@Controller('chat')
@UseGuards(JwtAuthGuard, TierGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations')
  @ApiOperation({
    summary: 'Create a new conversation',
    description: 'Creates a new conversation with another user, optionally about a marketplace listing or housing listing. Housing inquiries require TIER_1 verification.',
  })
  @ApiResponse({
    status: 201,
    description: 'Conversation created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          type: 'listing_inquiry',
          listingId: '550e8400-e29b-41d4-a716-446655440001',
          participants: [
            { id: '...', fullName: 'John Doe' },
            { id: '...', fullName: 'Jane Smith' },
          ],
          createdAt: '2024-01-15T10:30:00Z',
        },
        message: 'Conversation created successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cannot create conversation with yourself' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'TIER_1 required for housing inquiries' })
  async createConversation(
    @CurrentUser() user: User,
    @Body() dto: CreateConversationDto,
  ) {
    const conversation = await this.chatService.createConversation(
      user,
      dto,
    );
    return {
      success: true,
      data: conversation,
      message: 'Conversation created successfully',
    };
  }

  @Post('conversations/start')
  @ApiOperation({
    summary: 'Start conversation with initial message',
    description: 'Creates a new conversation and sends the first message in one call. Housing inquiries require TIER_1 verification.',
  })
  @ApiResponse({
    status: 201,
    description: 'Conversation started successfully',
    schema: {
      example: {
        success: true,
        data: {
          conversation: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            type: 'listing_inquiry',
            listing: {
              id: '550e8400-e29b-41d4-a716-446655440001',
              title: 'iPhone 13 Pro Max',
            },
          },
          message: {
            id: '550e8400-e29b-41d4-a716-446655440002',
            content: 'Hi! Is this still available?',
            createdAt: '2024-01-15T10:30:00Z',
          },
        },
        message: 'Conversation started successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'TIER_1 required for housing inquiries' })
  async startConversationWithMessage(
    @CurrentUser() user: User,
    @Body() dto: StartConversationWithMessageDto,
  ) {
    const result = await this.chatService.startConversationWithMessage(
      user,
      dto,
    );
    return {
      success: true,
      data: result,
      message: 'Conversation started successfully',
    };
  }

  @Get('conversations')
  @ApiOperation({
    summary: 'Get user conversations',
    description: 'Retrieves all conversations for the current user with pagination.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Conversations retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          conversations: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              type: 'listing_inquiry',
              listing: {
                id: '...',
                title: 'iPhone 13 Pro Max',
                imageUrls: ['...'],
              },
              otherParticipant: {
                id: '...',
                fullName: 'Jane Smith',
                avatarUrl: '...',
              },
              lastMessage: {
                content: 'Sounds good, let\'s meet tomorrow',
                createdAt: '2024-01-15T14:00:00Z',
              },
              unreadCount: 2,
            },
          ],
          total: 15,
          page: 1,
          limit: 20,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserConversations(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.chatService.getUserConversations(
      user.id,
      page || 1,
      limit || 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('conversations/:id')
  @ApiOperation({
    summary: 'Get conversation by ID',
    description: 'Retrieves a single conversation with full details.',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          type: 'listing_inquiry',
          listing: {
            id: '...',
            title: 'iPhone 13 Pro Max',
            price: 450000,
            status: 'active',
          },
          participants: [
            { id: '...', fullName: 'John Doe', avatarUrl: '...' },
            { id: '...', fullName: 'Jane Smith', avatarUrl: '...' },
          ],
          createdAt: '2024-01-15T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a participant in this conversation' })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  async getConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const conversation = await this.chatService.getConversationById(id, user.id);
    return {
      success: true,
      data: conversation,
    };
  }

  @Get('conversations/:id/messages')
  @ApiOperation({
    summary: 'Get conversation messages',
    description: 'Retrieves messages for a conversation with pagination (newest first).',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 50 })
  @ApiResponse({
    status: 200,
    description: 'Messages retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          messages: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              senderId: '...',
              content: 'Sure, I can meet at 3pm',
              attachments: [],
              isRead: true,
              createdAt: '2024-01-15T14:00:00Z',
            },
            {
              id: '550e8400-e29b-41d4-a716-446655440001',
              senderId: '...',
              content: 'Can we meet tomorrow?',
              attachments: [],
              isRead: true,
              createdAt: '2024-01-15T13:55:00Z',
            },
          ],
          total: 25,
          page: 1,
          limit: 50,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a participant in this conversation' })
  async getConversationMessages(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.chatService.getConversationMessages(
      id,
      user.id,
      page || 1,
      limit || 50,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Post('messages')
  @ApiOperation({
    summary: 'Send a message',
    description: 'Sends a new message in an existing conversation.',
  })
  @ApiResponse({
    status: 201,
    description: 'Message sent successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          conversationId: '...',
          senderId: '...',
          content: 'Hi! Is this still available?',
          attachments: [],
          isRead: false,
          createdAt: '2024-01-15T10:30:00Z',
        },
        message: 'Message sent successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a participant in this conversation' })
  async sendMessage(
    @CurrentUser() user: User,
    @Body() dto: SendMessageDto,
  ) {
    const message = await this.chatService.sendMessage(user.id, dto);
    return {
      success: true,
      data: message,
      message: 'Message sent successfully',
    };
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark messages as read',
    description: 'Marks all messages in a conversation as read for the current user.',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Messages marked as read',
    schema: {
      example: {
        success: true,
        message: 'Messages marked as read',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a participant in this conversation' })
  async markMessagesAsRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.chatService.markMessagesAsRead(id, user.id);
    return {
      success: true,
      message: 'Messages marked as read',
    };
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete conversation',
    description: 'Deletes a conversation for the current user (soft delete).',
  })
  @ApiParam({
    name: 'id',
    description: 'Conversation UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Conversation deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Conversation deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not a participant in this conversation' })
  async deleteConversation(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.chatService.deleteConversation(id, user.id);
    return {
      success: true,
      message: 'Conversation deleted successfully',
    };
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get total unread message count',
    description: 'Returns the total number of unread messages across all conversations.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread count retrieved',
    schema: {
      example: {
        success: true,
        data: { unreadCount: 5 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTotalUnreadCount(@CurrentUser() user: User) {
    const count = await this.chatService.getTotalUnreadCount(user.id);
    return {
      success: true,
      data: { unreadCount: count },
    };
  }
}
