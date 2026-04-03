import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { UploadService } from './upload.service';

interface CleanupOrphanedUploadsJobData {
  olderThanHours: number;
}

@Processor('uploads')
export class UploadProcessor extends WorkerHost {
  private readonly logger = new Logger(UploadProcessor.name);

  constructor(private readonly uploadService: UploadService) {
    super();
  }

  async process(job: Job<CleanupOrphanedUploadsJobData>): Promise<any> {
    this.logger.log(`Processing upload job: ${job.name} (${job.id})`);

    try {
      switch (job.name) {
        case 'cleanup-orphaned-uploads':
          return this.handleCleanup(job.data);
        default:
          throw new Error(`Unknown job: ${job.name}`);
      }
    } catch (error) {
      this.logger.error(`Failed to process job ${job.name}`, error);
      throw error;
    }
  }

  private async handleCleanup(
    data: CleanupOrphanedUploadsJobData,
  ): Promise<void> {
    const count = await this.uploadService.cleanupOrphanedUploads(
      data.olderThanHours,
    );
    this.logger.log(`Cleanup complete: removed ${count} orphaned uploads`);
  }
}
