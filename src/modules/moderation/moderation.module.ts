import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { ContentModerationService } from './content-moderation.service';
import { ModerationProcessor } from './moderation.processor';
import { Report } from '../../database/entities/report.entity';
import { BanAppeal } from '../../database/entities/ban-appeal.entity';
import { Warning } from '../../database/entities/warning.entity';
import { ModerationQueue } from '../../database/entities/moderation-queue.entity';
import { User } from '../../database/entities/user.entity';
import { Listing } from '../../database/entities/listing.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Report,
      BanAppeal,
      Warning,
      ModerationQueue,
      User,
      Listing,
    ]),
    BullModule.registerQueue({
      name: 'moderation',
    }),
  ],
  controllers: [ModerationController],
  providers: [ModerationService, ContentModerationService, ModerationProcessor],
  exports: [ModerationService, ContentModerationService],
})
export class ModerationModule {}
