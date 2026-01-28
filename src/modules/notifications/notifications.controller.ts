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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
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
