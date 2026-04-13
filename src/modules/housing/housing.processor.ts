import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { HousingService } from './housing.service';
import {
  HOUSING_QUEUE_NAME,
  HousingJobName,
} from './interfaces/housing-jobs.interface';

@Processor(HOUSING_QUEUE_NAME)
export class HousingProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(HousingProcessor.name);

  constructor(
    private readonly housingService: HousingService,
    @InjectQueue(HOUSING_QUEUE_NAME) private readonly housingQueue: Queue,
  ) {
    super();
  }

  /**
   * Register the repeatable daily job on module boot. Using a stable jobId
   * so restarts don't stack up duplicate schedules.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.housingQueue.add(
        HousingJobName.EXPIRE_STALE_LISTINGS,
        {},
        {
          repeat: { pattern: '0 3 * * *' }, // 03:00 daily
          jobId: 'housing-expire-stale-cron',
          removeOnComplete: true,
          removeOnFail: 100,
        },
      );
      this.logger.log('Scheduled daily housing expiry job (03:00)');
    } catch (err) {
      this.logger.error(`Failed to schedule housing expiry job: ${err}`);
    }
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case HousingJobName.EXPIRE_STALE_LISTINGS: {
        const expired = await this.housingService.expireStaleListings();
        return { expired };
      }
      default:
        this.logger.warn(`Unknown housing job: ${job.name}`);
        return null;
    }
  }
}
