import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { UploadProcessor } from './upload.processor';
import { PendingUpload } from '../../database/entities/pending-upload.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([PendingUpload]),
    BullModule.registerQueue({
      name: 'uploads',
    }),
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max (video uploads)
        files: 10,
      },
    }),
  ],
  controllers: [UploadController],
  providers: [UploadService, UploadProcessor],
  exports: [UploadService],
})
export class UploadModule implements OnModuleInit {
  private readonly logger = new Logger(UploadModule.name);

  constructor(@InjectQueue('uploads') private readonly uploadsQueue: Queue) {}

  async onModuleInit() {
    await this.uploadsQueue.add(
      'cleanup-orphaned-uploads',
      { olderThanHours: 24 },
      {
        repeat: { pattern: '0 3 * * *' }, // Daily at 3 AM
        removeOnComplete: true,
        removeOnFail: false,
      },
    );
    this.logger.log('Registered orphaned uploads cleanup job (daily at 3 AM)');
  }
}
