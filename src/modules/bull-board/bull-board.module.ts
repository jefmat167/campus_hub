import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

// Queue names - must match the names used in feature modules
export const QUEUE_NAMES = ['auth', 'notifications', 'moderation'] as const;

@Module({
  imports: [
    // Register all queues for Bull Board to access
    ...QUEUE_NAMES.map((name) => BullModule.registerQueue({ name })),
  ],
  exports: [BullModule],
})
export class BullBoardModule {}
