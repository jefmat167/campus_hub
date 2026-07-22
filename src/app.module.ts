import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';

// Config
import { envValidationSchema } from './config/env.validation';
import { typeOrmConfig } from './config/typeorm.config';
import { redisConfig } from './config/redis.config';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { UniversitiesModule } from './modules/universities/universities.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { VerificationModule } from './modules/verification/verification.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { OffersModule } from './modules/offers/offers.module';
import { ChatModule } from './modules/chat/chat.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { UploadModule } from './modules/upload/upload.module';
import { PaymentModule } from './modules/payment/payment.module';
import { EscrowModule } from './modules/escrow/escrow.module';
import { SocialModule } from './modules/social/social.module';
import { HousingModule } from './modules/housing/housing.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NewsModule } from './modules/news/news.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { HealthModule } from './modules/health/health.module';
import { DevModule } from './modules/dev/dev.module';
import { BullBoardModule } from './modules/bull-board/bull-board.module';
import { AdminModule } from './modules/admin/admin.module';
import { PermissionsModule } from './common/modules/permissions.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envValidationSchema,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database (PostgreSQL)
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: typeOrmConfig,
      inject: [ConfigService],
    }),

    // Cache (Redis)
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: redisConfig,
      inject: [ConfigService],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 3,
      },
      {
        name: 'medium',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'long',
        ttl: 3600000,
        limit: 1000,
      },
    ]),

    // BullMQ for background jobs
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
        },
        // Global job defaults for every queue. Per-job options passed to
        // `queue.add()` still override these. Without this block, completed and
        // failed jobs accumulate in Redis indefinitely (eventual OOM), and jobs
        // run with BullMQ's default of a single attempt — so a transient error
        // silently drops the job (notably `send-push`, which passes no options).
        defaultJobOptions: {
          // Retry transient failures. Matches the per-job convention already
          // used by the auth / users / escrow queues.
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          // Bound completed-job retention: keep a recent window for Bull Board.
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          // Retain failed jobs (once retries are exhausted) as a bounded
          // dead-letter trail to inspect/replay in Bull Board; the count cap
          // stops a failure storm from exhausting Redis.
          removeOnFail: { age: 7 * 24 * 3600, count: 1000 },
        },
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    AuthModule,
    UsersModule,
    UniversitiesModule,
    WalletModule,
    VerificationModule,
    MarketplaceModule,
    OffersModule,
    ChatModule,
    ReviewsModule,
    UploadModule,
    PaymentModule,
    EscrowModule,
    SocialModule,
    HousingModule,
    ModerationModule,
    NewsModule,
    NotificationsModule,
    HealthModule,
    DevModule,
    BullBoardModule,
    AdminModule,
    PermissionsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
