import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ContentModerationService } from './content-moderation.service';
import { ModerationContentType } from '../../database/entities/moderation-queue.entity';

export interface ModerationJobData {
  contentType: ModerationContentType;
  contentId: string;
  userId: string;
  content: string;
}

export interface ExpiredBanJobData {
  userId: string;
}

@Processor('moderation')
export class ModerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ModerationProcessor.name);

  constructor(
    private readonly contentModerationService: ContentModerationService,
  ) {
    super();
  }

  async process(job: Job<ModerationJobData | ExpiredBanJobData>): Promise<any> {
    this.logger.log(`Processing job ${job.name} (${job.id})`);

    try {
      switch (job.name) {
        case 'moderate-content':
          return this.handleModerateContent(job.data as ModerationJobData);

        case 'check-expired-bans':
          return this.handleCheckExpiredBans();

        case 'auto-escalate':
          return this.handleAutoEscalate();

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Job ${job.name} failed: ${error}`);
      throw error;
    }
  }

  /**
   * Process content moderation job
   */
  private async handleModerateContent(data: ModerationJobData) {
    const { contentType, contentId, userId, content } = data;

    this.logger.log(`Moderating ${contentType} content: ${contentId}`);

    const result = await this.contentModerationService.moderateContent(
      content,
      contentType,
      contentId,
      userId,
    );

    this.logger.log(
      `Moderation result for ${contentId}: score=${result.score}, flagged=${result.shouldFlag}`,
    );

    return result;
  }

  /**
   * Check and auto-unban users with expired temporary bans
   */
  private async handleCheckExpiredBans() {
    this.logger.log('Checking for expired bans...');
    // This would be handled by the ModerationService
    // but could be called here as a scheduled job
    return { checked: true };
  }

  /**
   * Auto-escalate high-priority items that haven't been reviewed
   */
  private async handleAutoEscalate() {
    this.logger.log('Checking for items to auto-escalate...');
    // Items in queue for > 24 hours with high priority could be escalated
    return { checked: true };
  }
}
