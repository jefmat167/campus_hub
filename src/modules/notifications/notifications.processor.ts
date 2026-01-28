import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Notification } from '../../database/entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { PushMessage } from './firebase.service';

interface SendPushJobData {
  notificationId: string;
  userId: string;
  message: PushMessage;
}

interface BroadcastJobData {
  userIds: string[];
  message: PushMessage;
}

interface CleanupJobData {
  daysOld: number;
}

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly notificationsService: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<SendPushJobData | BroadcastJobData | CleanupJobData>): Promise<any> {
    this.logger.log(`Processing notification job: ${job.name} (${job.id})`);

    try {
      switch (job.name) {
        case 'send-push':
          return this.handleSendPush(job.data as SendPushJobData);

        case 'broadcast':
          return this.handleBroadcast(job.data as BroadcastJobData);

        case 'cleanup':
          return this.handleCleanup(job.data as CleanupJobData);

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Notification job ${job.name} failed: ${error}`);
      throw error;
    }
  }

  /**
   * Send push notification to a single user
   */
  private async handleSendPush(data: SendPushJobData): Promise<void> {
    const { notificationId, userId, message } = data;

    await this.notificationsService.sendPushToUser(userId, message);

    // Update notification record
    await this.notificationRepository.update(notificationId, {
      pushSent: true,
      pushSentAt: new Date(),
    });

    this.logger.log(`Push notification sent for notification ${notificationId}`);
  }

  /**
   * Broadcast push notification to multiple users
   */
  private async handleBroadcast(data: BroadcastJobData): Promise<void> {
    const { userIds, message } = data;

    await this.notificationsService.sendPushToUsers(userIds, message);

    this.logger.log(`Broadcast sent to ${userIds.length} users`);
  }

  /**
   * Cleanup old notifications
   */
  private async handleCleanup(data: CleanupJobData): Promise<void> {
    const deleted = await this.notificationsService.deleteOldNotifications(data.daysOld);

    this.logger.log(`Cleaned up ${deleted} old notifications`);
  }
}
