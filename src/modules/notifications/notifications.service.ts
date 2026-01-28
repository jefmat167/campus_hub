import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Notification, NotificationType } from '../../database/entities/notification.entity';
import { FcmToken } from '../../database/entities/fcm-token.entity';
import { NotificationPreference } from '../../database/entities/notification-preference.entity';
import { FirebaseService, PushMessage } from './firebase.service';
import { RegisterTokenDto, UpdatePreferencesDto } from './dto';

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(FcmToken)
    private readonly fcmTokenRepository: Repository<FcmToken>,
    @InjectRepository(NotificationPreference)
    private readonly preferenceRepository: Repository<NotificationPreference>,
    @InjectQueue('notifications')
    private readonly notificationQueue: Queue,
    private readonly firebaseService: FirebaseService,
  ) {}

  // ============ NOTIFICATIONS ============

  /**
   * Create and send a notification
   */
  async createNotification(params: CreateNotificationParams): Promise<Notification> {
    // Check user preferences
    const preferences = await this.getOrCreatePreferences(params.userId);

    if (!this.shouldSendNotification(preferences, params.type)) {
      // Still create the notification but don't send push
      const notification = this.notificationRepository.create({
        ...params,
        pushSent: false,
      });
      return this.notificationRepository.save(notification);
    }

    // Create notification record
    const notification = this.notificationRepository.create(params);
    const savedNotification = await this.notificationRepository.save(notification);

    // Queue push notification if enabled
    if (preferences.pushEnabled && this.firebaseService.isEnabled()) {
      await this.notificationQueue.add('send-push', {
        notificationId: savedNotification.id,
        userId: params.userId,
        message: {
          title: params.title,
          body: params.body,
          data: params.data ? this.stringifyData(params.data) : undefined,
          imageUrl: params.imageUrl,
        },
      });
    }

    return savedNotification;
  }

  /**
   * Get user's notifications
   */
  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
    unreadOnly: boolean = false,
  ): Promise<{ notifications: Notification[]; total: number; unreadCount: number }> {
    const whereClause: any = { userId };
    if (unreadOnly) {
      whereClause.isRead = false;
    }

    const [notifications, total] = await this.notificationRepository.findAndCount({
      where: whereClause,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const unreadCount = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });

    return { notifications, total, unreadCount };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.isRead) {
      notification.isRead = true;
      notification.readAt = new Date();
      await this.notificationRepository.save(notification);
    }

    return notification;
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(userId: string): Promise<void> {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: { userId, isRead: false },
    });
  }

  /**
   * Delete old notifications (cleanup job)
   */
  async deleteOldNotifications(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.notificationRepository.delete({
      createdAt: LessThan(cutoffDate),
      isRead: true,
    });

    return result.affected || 0;
  }

  // ============ FCM TOKENS ============

  /**
   * Register FCM token for push notifications
   */
  async registerToken(userId: string, dto: RegisterTokenDto): Promise<FcmToken> {
    // Check if token already exists
    let existingToken = await this.fcmTokenRepository.findOne({
      where: { token: dto.token },
    });

    if (existingToken) {
      // Update existing token
      existingToken.userId = userId;
      existingToken.platform = dto.platform;
      existingToken.deviceId = dto.deviceId || null;
      existingToken.deviceName = dto.deviceName || null;
      existingToken.isActive = true;
      existingToken.failureCount = 0;
      return this.fcmTokenRepository.save(existingToken);
    }

    // Create new token
    const token = this.fcmTokenRepository.create({
      userId,
      ...dto,
    });

    return this.fcmTokenRepository.save(token);
  }

  /**
   * Unregister FCM token
   */
  async unregisterToken(userId: string, token: string): Promise<void> {
    await this.fcmTokenRepository.delete({ userId, token });
  }

  /**
   * Get user's active tokens
   */
  async getUserTokens(userId: string): Promise<FcmToken[]> {
    return this.fcmTokenRepository.find({
      where: { userId, isActive: true },
    });
  }

  /**
   * Mark token as failed (for cleanup)
   */
  async markTokenFailed(token: string): Promise<void> {
    const fcmToken = await this.fcmTokenRepository.findOne({
      where: { token },
    });

    if (fcmToken) {
      fcmToken.failureCount += 1;

      // Deactivate after 3 failures
      if (fcmToken.failureCount >= 3) {
        fcmToken.isActive = false;
      }

      await this.fcmTokenRepository.save(fcmToken);
    }
  }

  /**
   * Mark token as used successfully
   */
  async markTokenUsed(token: string): Promise<void> {
    await this.fcmTokenRepository.update(
      { token },
      { lastUsedAt: new Date(), failureCount: 0 },
    );
  }

  // ============ PREFERENCES ============

  /**
   * Get user's notification preferences
   */
  async getPreferences(userId: string): Promise<NotificationPreference> {
    return this.getOrCreatePreferences(userId);
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    dto: UpdatePreferencesDto,
  ): Promise<NotificationPreference> {
    const preferences = await this.getOrCreatePreferences(userId);
    Object.assign(preferences, dto);
    return this.preferenceRepository.save(preferences);
  }

  // ============ PUSH SENDING ============

  /**
   * Send push notification to user
   */
  async sendPushToUser(userId: string, message: PushMessage): Promise<void> {
    const tokens = await this.fcmTokenRepository.find({
      where: { userId, isActive: true },
    });

    if (tokens.length === 0) {
      this.logger.debug(`No active tokens for user ${userId}`);
      return;
    }

    const tokenStrings = tokens.map((t) => t.token);
    const result = await this.firebaseService.sendToDevices(tokenStrings, message);

    // Handle failures
    result.results.forEach((res, index) => {
      const token = tokenStrings[index];
      if (res.success) {
        this.markTokenUsed(token);
      } else {
        this.markTokenFailed(token);
      }
    });

    this.logger.log(
      `Push sent to user ${userId}: ${result.successCount} success, ${result.failureCount} failed`,
    );
  }

  /**
   * Send push notification to multiple users
   */
  async sendPushToUsers(userIds: string[], message: PushMessage): Promise<void> {
    const tokens = await this.fcmTokenRepository.find({
      where: { userId: In(userIds), isActive: true },
    });

    if (tokens.length === 0) return;

    const tokenStrings = tokens.map((t) => t.token);
    await this.firebaseService.sendToDevices(tokenStrings, message);
  }

  // ============ HELPERS ============

  private async getOrCreatePreferences(userId: string): Promise<NotificationPreference> {
    let preferences = await this.preferenceRepository.findOne({
      where: { userId },
    });

    if (!preferences) {
      preferences = this.preferenceRepository.create({ userId });
      preferences = await this.preferenceRepository.save(preferences);
    }

    return preferences;
  }

  private shouldSendNotification(
    preferences: NotificationPreference,
    type: NotificationType,
  ): boolean {
    // Check quiet hours
    if (preferences.quietHoursEnabled && this.isInQuietHours(preferences)) {
      return false;
    }

    // Check category preferences
    const categoryMap: Record<string, keyof NotificationPreference> = {
      new_message: 'messagesEnabled',
      offer_received: 'offersEnabled',
      offer_accepted: 'offersEnabled',
      offer_rejected: 'offersEnabled',
      offer_countered: 'offersEnabled',
      offer_expired: 'offersEnabled',
      escrow_initiated: 'escrowEnabled',
      escrow_confirmed: 'escrowEnabled',
      escrow_released: 'escrowEnabled',
      escrow_cancelled: 'escrowEnabled',
      escrow_disputed: 'escrowEnabled',
      review_received: 'reviewsEnabled',
      post_reaction: 'socialEnabled',
      post_comment: 'socialEnabled',
      comment_reply: 'socialEnabled',
      roommate_interest: 'housingEnabled',
      roommate_match: 'housingEnabled',
      announcement: 'announcementsEnabled',
    };

    const preferenceKey = categoryMap[type];
    if (preferenceKey && !preferences[preferenceKey]) {
      return false;
    }

    return true;
  }

  private isInQuietHours(preferences: NotificationPreference): boolean {
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const start = preferences.quietHoursStart;
    const end = preferences.quietHoursEnd;

    // Handle overnight quiet hours (e.g., 22:00 to 07:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }

    return currentTime >= start && currentTime < end;
  }

  private stringifyData(data: Record<string, any>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    return result;
  }
}
