import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { NotificationsService } from './notifications.service';
import { RegisterTokenDto, UpdatePreferencesDto } from './dto';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ============ NOTIFICATIONS ============

  /**
   * Get user's notifications
   */
  @Get()
  @ApiOperation({
    summary: 'Get notifications',
    description: 'Retrieve a paginated list of notifications for the authenticated user. Supports filtering by read status.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)', example: 20 })
  @ApiQuery({ name: 'unreadOnly', required: false, type: String, description: 'Filter to unread notifications only (true/false)', example: 'false' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of notifications',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            type: 'offer_received',
            title: 'New offer on your listing',
            body: 'Chidi offered ₦20,000 for your iPhone 13 Pro Max',
            data: { listingId: '...', offerId: '...' },
            imageUrl: null,
            isRead: false,
            readAt: null,
            createdAt: '2026-03-19T14:30:00.000Z',
          },
        ],
        meta: { total: 25, page: 1, limit: 20, unreadCount: 8, pages: 2 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async getNotifications(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    const { notifications, total, unreadCount } =
      await this.notificationsService.getUserNotifications(
        user.id,
        Number(page) || 1,
        Number(limit) || 20,
        unreadOnly === 'true',
      );

    return {
      success: true,
      data: notifications,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        unreadCount,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Get unread count
   */
  @Get('unread-count')
  @ApiOperation({
    summary: 'Get unread notification count',
    description: 'Returns the total number of unread notifications for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unread notification count',
    schema: {
      example: { success: true, data: { unreadCount: 8 } },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async getUnreadCount(@CurrentUser() user: User) {
    const count = await this.notificationsService.getUnreadCount(user.id);

    return {
      success: true,
      data: { unreadCount: count },
    };
  }

  /**
   * Mark notification as read
   */
  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Mark a single notification as read by its ID. The notification must belong to the authenticated user.',
  })
  @ApiParam({ name: 'id', description: 'Notification UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          isRead: true,
          readAt: '2026-03-19T15:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const notification = await this.notificationsService.markAsRead(id, user.id);

    return {
      success: true,
      data: notification,
    };
  }

  /**
   * Mark all notifications as read
   */
  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Mark all unread notifications as read for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read',
    schema: {
      example: { success: true, message: 'All notifications marked as read' },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async markAllAsRead(@CurrentUser() user: User) {
    await this.notificationsService.markAllAsRead(user.id);

    return {
      success: true,
      message: 'All notifications marked as read',
    };
  }

  // ============ FCM TOKENS ============

  /**
   * Register FCM token for push notifications
   */
  @Post('tokens')
  @ApiOperation({
    summary: 'Register push notification token',
    description: 'Register an FCM token for receiving push notifications. If the token already exists, it will be updated and reactivated.',
  })
  @ApiResponse({
    status: 201,
    description: 'Push notification token registered',
    schema: {
      example: {
        success: true,
        data: { id: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890' },
        message: 'Push notification token registered',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async registerToken(
    @CurrentUser() user: User,
    @Body() dto: RegisterTokenDto,
  ) {
    const token = await this.notificationsService.registerToken(user.id, dto);

    return {
      success: true,
      data: { id: token.id },
      message: 'Push notification token registered',
    };
  }

  /**
   * Unregister FCM token
   */
  @Delete('tokens/:token')
  @ApiOperation({
    summary: 'Unregister push notification token',
    description: 'Remove an FCM token to stop receiving push notifications on the associated device.',
  })
  @ApiParam({ name: 'token', description: 'The FCM token string to unregister', example: 'dGVzdC1mY20tdG9rZW4tMTIzNDU2Nzg5MA...' })
  @ApiResponse({
    status: 200,
    description: 'Token unregistered successfully',
    schema: {
      example: { success: true, message: 'Token unregistered' },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async unregisterToken(
    @CurrentUser() user: User,
    @Param('token') token: string,
  ) {
    await this.notificationsService.unregisterToken(user.id, token);

    return {
      success: true,
      message: 'Token unregistered',
    };
  }

  /**
   * Get registered devices
   */
  @Get('devices')
  @ApiOperation({
    summary: 'Get registered devices',
    description: 'Retrieve a list of all devices registered for push notifications for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of registered devices',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
            platform: 'android',
            deviceName: 'Samsung Galaxy S21',
            lastUsedAt: '2026-03-19T14:30:00.000Z',
            createdAt: '2026-03-01T10:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async getDevices(@CurrentUser() user: User) {
    const tokens = await this.notificationsService.getUserTokens(user.id);

    return {
      success: true,
      data: tokens.map((t) => ({
        id: t.id,
        platform: t.platform,
        deviceName: t.deviceName,
        lastUsedAt: t.lastUsedAt,
        createdAt: t.createdAt,
      })),
    };
  }

  // ============ PREFERENCES ============

  /**
   * Get notification preferences
   */
  @Get('preferences')
  @ApiOperation({
    summary: 'Get notification preferences',
    description: 'Retrieve the notification preference settings for the authenticated user. Preferences are created with default values on first access.',
  })
  @ApiResponse({
    status: 200,
    description: 'User notification preferences',
    schema: {
      example: {
        success: true,
        data: {
          pushEnabled: true,
          emailEnabled: true,
          messagesEnabled: true,
          offersEnabled: true,
          escrowEnabled: true,
          reviewsEnabled: true,
          socialEnabled: true,
          housingEnabled: true,
          announcementsEnabled: true,
          quietHoursEnabled: false,
          quietHoursStart: '22:00',
          quietHoursEnd: '07:00',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async getPreferences(@CurrentUser() user: User) {
    const preferences = await this.notificationsService.getPreferences(user.id);

    return {
      success: true,
      data: preferences,
    };
  }

  /**
   * Update notification preferences
   */
  @Patch('preferences')
  @ApiOperation({
    summary: 'Update notification preferences',
    description: 'Update notification preference settings for the authenticated user. Only the fields provided in the request body will be updated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Preferences updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          pushEnabled: true,
          emailEnabled: false,
          messagesEnabled: true,
          offersEnabled: true,
          escrowEnabled: true,
          reviewsEnabled: true,
          socialEnabled: true,
          housingEnabled: true,
          announcementsEnabled: true,
          quietHoursEnabled: true,
          quietHoursStart: '23:00',
          quietHoursEnd: '07:00',
        },
        message: 'Preferences updated',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing JWT token' })
  async updatePreferences(
    @CurrentUser() user: User,
    @Body() dto: UpdatePreferencesDto,
  ) {
    const preferences = await this.notificationsService.updatePreferences(
      user.id,
      dto,
    );

    return {
      success: true,
      data: preferences,
      message: 'Preferences updated',
    };
  }
}
