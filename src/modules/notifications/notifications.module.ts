import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { FirebaseService } from './firebase.service';
import { Notification } from '../../database/entities/notification.entity';
import { FcmToken } from '../../database/entities/fcm-token.entity';
import { NotificationPreference } from '../../database/entities/notification-preference.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, FcmToken, NotificationPreference]),
    BullModule.registerQueue({
      name: 'notifications',
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsProcessor, FirebaseService],
  exports: [NotificationsService, FirebaseService],
})
export class NotificationsModule {}
