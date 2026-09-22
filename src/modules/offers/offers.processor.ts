import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { OffersService } from './offers.service';
import { BuyRequestOffersService } from '../marketplace/buy-request-offers.service';
import {
  OFFERS_QUEUE_NAME,
  OFFER_EXPIRY_CRON,
  OffersJobName,
} from './interfaces/offers-jobs.interface';

/**
 * The offer-expiry sweeps. Both offer kinds carry a 48h `expiresAt`, but until
 * this processor existed nothing ever called `markExpiredOffers()` — a stale
 * offer stayed `pending` in every list forever, and expiry was only enforced
 * lazily when the other party tried to respond. Two repeatable jobs on the
 * `offers` queue, stable jobIds so restarts don't stack schedules (same
 * pattern as the housing cron).
 */
@Processor(OFFERS_QUEUE_NAME)
export class OffersProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(OffersProcessor.name);

  constructor(
    private readonly offersService: OffersService,
    private readonly buyRequestOffersService: BuyRequestOffersService,
    @InjectQueue(OFFERS_QUEUE_NAME) private readonly offersQueue: Queue,
  ) {
    super();
  }

  async onModuleInit(): Promise<void> {
    for (const name of [
      OffersJobName.EXPIRE_LISTING_OFFERS,
      OffersJobName.EXPIRE_BUY_REQUEST_OFFERS,
    ]) {
      try {
        await this.offersQueue.add(
          name,
          {},
          {
            repeat: { pattern: OFFER_EXPIRY_CRON },
            jobId: `${name}-cron`,
            removeOnComplete: true,
            removeOnFail: 100,
          },
        );
        this.logger.log(`Scheduled ${name} (${OFFER_EXPIRY_CRON})`);
      } catch (err) {
        this.logger.error(`Failed to schedule ${name}: ${err}`);
      }
    }
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case OffersJobName.EXPIRE_LISTING_OFFERS: {
        const expired = await this.offersService.markExpiredOffers();
        if (expired > 0) this.logger.log(`Expired ${expired} listing offer(s)`);
        return { expired };
      }
      case OffersJobName.EXPIRE_BUY_REQUEST_OFFERS: {
        const expired = await this.buyRequestOffersService.markExpiredOffers();
        if (expired > 0) this.logger.log(`Expired ${expired} buy-request offer(s)`);
        return { expired };
      }
      default:
        this.logger.warn(`Unknown offers job: ${job.name}`);
        return null;
    }
  }
}
