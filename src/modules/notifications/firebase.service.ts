import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class FirebaseService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseService.name);
  private app: admin.app.App | null = null;
  private isInitialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initializeFirebase();
  }

  private initializeFirebase(): void {
    const projectId = this.configService.get<string>('FIREBASE_PROJECT_ID');
    const privateKey = this.configService.get<string>('FIREBASE_PRIVATE_KEY');
    const clientEmail = this.configService.get<string>('FIREBASE_CLIENT_EMAIL');

    if (!projectId || !privateKey || !clientEmail) {
      this.logger.warn(
        'Firebase credentials not configured. Push notifications will be disabled.',
      );
      return;
    }

    try {
      this.app = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          privateKey: privateKey.replace(/\\n/g, '\n'),
          clientEmail,
        }),
      });
      this.isInitialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Firebase: ${error}`);
    }
  }

  isEnabled(): boolean {
    return this.isInitialized;
  }

  /**
   * Send push notification to a single device
   */
  async sendToDevice(token: string, message: PushMessage): Promise<SendResult> {
    if (!this.isInitialized) {
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const fcmMessage: admin.messaging.Message = {
        token,
        notification: {
          title: message.title,
          body: message.body,
          imageUrl: message.imageUrl,
        },
        data: message.data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            priority: 'high',
            defaultSound: true,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: message.title,
                body: message.body,
              },
              sound: 'default',
              badge: 1,
            },
          },
        },
        webpush: {
          notification: {
            title: message.title,
            body: message.body,
            icon: '/icon-192x192.png',
          },
        },
      };

      const response = await admin.messaging().send(fcmMessage);
      return { success: true, messageId: response };
    } catch (error: any) {
      this.logger.error(`Failed to send push notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to multiple devices
   */
  async sendToDevices(tokens: string[], message: PushMessage): Promise<{
    successCount: number;
    failureCount: number;
    results: SendResult[];
  }> {
    if (!this.isInitialized) {
      return {
        successCount: 0,
        failureCount: tokens.length,
        results: tokens.map(() => ({ success: false, error: 'Firebase not initialized' })),
      };
    }

    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0, results: [] };
    }

    try {
      const fcmMessage: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: message.title,
          body: message.body,
          imageUrl: message.imageUrl,
        },
        data: message.data,
        android: {
          priority: 'high',
          notification: {
            channelId: 'default',
            priority: 'high',
            defaultSound: true,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: message.title,
                body: message.body,
              },
              sound: 'default',
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(fcmMessage);

      const results: SendResult[] = response.responses.map((res: admin.messaging.SendResponse, index: number) => {
        if (res.success) {
          return { success: true, messageId: res.messageId };
        }
        return { success: false, error: res.error?.message };
      });

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        results,
      };
    } catch (error: any) {
      this.logger.error(`Failed to send multicast push notification: ${error.message}`);
      return {
        successCount: 0,
        failureCount: tokens.length,
        results: tokens.map(() => ({ success: false, error: error.message })),
      };
    }
  }

  /**
   * Send to a topic (for broadcasts)
   */
  async sendToTopic(topic: string, message: PushMessage): Promise<SendResult> {
    if (!this.isInitialized) {
      return { success: false, error: 'Firebase not initialized' };
    }

    try {
      const fcmMessage: admin.messaging.Message = {
        topic,
        notification: {
          title: message.title,
          body: message.body,
          imageUrl: message.imageUrl,
        },
        data: message.data,
      };

      const response = await admin.messaging().send(fcmMessage);
      return { success: true, messageId: response };
    } catch (error: any) {
      this.logger.error(`Failed to send topic notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Subscribe tokens to a topic
   */
  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    if (!this.isInitialized || tokens.length === 0) return;

    try {
      await admin.messaging().subscribeToTopic(tokens, topic);
    } catch (error: any) {
      this.logger.error(`Failed to subscribe to topic: ${error.message}`);
    }
  }

  /**
   * Unsubscribe tokens from a topic
   */
  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    if (!this.isInitialized || tokens.length === 0) return;

    try {
      await admin.messaging().unsubscribeFromTopic(tokens, topic);
    } catch (error: any) {
      this.logger.error(`Failed to unsubscribe from topic: ${error.message}`);
    }
  }
}
