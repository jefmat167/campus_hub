import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, forwardRef, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  ESCROW_QUEUE_NAME,
  EscrowJobName,
  CheckFulfillmentExpiryPayload,
  CheckAutoReleasePayload,
  SendFulfillmentReminderPayload,
  OrderConfirmTimeoutPayload,
} from './interfaces/escrow-jobs.interface';
import { EscrowService } from './escrow.service';

@Processor(ESCROW_QUEUE_NAME)
export class EscrowProcessor extends WorkerHost {
  private readonly logger = new Logger(EscrowProcessor.name);

  constructor(
    @Inject(forwardRef(() => EscrowService))
    private readonly escrowService: EscrowService,
  ) {
    super();
  }

  async process(
    job: Job<
      | CheckFulfillmentExpiryPayload
      | CheckAutoReleasePayload
      | SendFulfillmentReminderPayload
      | OrderConfirmTimeoutPayload
    >,
  ): Promise<any> {
    this.logger.log(`Processing escrow job: ${job.name} (${job.id})`);

    try {
      switch (job.name) {
        case EscrowJobName.CHECK_FULFILLMENT_EXPIRY:
          return this.handleFulfillmentExpiry(
            job.data as CheckFulfillmentExpiryPayload,
          );

        case EscrowJobName.CHECK_AUTO_RELEASE:
          return this.handleAutoRelease(job.data as CheckAutoReleasePayload);

        case EscrowJobName.ORDER_CONFIRM_TIMEOUT: {
          const { escrowId } = job.data as OrderConfirmTimeoutPayload;
          await this.escrowService.handleConfirmationTimeout(escrowId);
          return { success: true };
        }

        case EscrowJobName.SEND_FULFILLMENT_REMINDER: {
          const { escrowId, reminderNumber } =
            job.data as SendFulfillmentReminderPayload;
          await this.escrowService.sendFulfillmentReminder(
            escrowId,
            reminderNumber,
          );
          return { success: true };
        }

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Escrow job ${job.name} failed: ${error}`);
      throw error;
    }
  }

  /**
   * Handle 72h fulfillment timer expiry
   * Called when seller hasn't clicked "I'm Ready" within 72 hours
   * Action: Auto-cancel escrow and refund buyer
   */
  private async handleFulfillmentExpiry(
    data: CheckFulfillmentExpiryPayload,
  ): Promise<{ success: boolean; message: string }> {
    const { escrowId } = data;

    this.logger.log(`Processing fulfillment expiry for escrow ${escrowId}`);

    try {
      await this.escrowService.handleFulfillmentExpiry(escrowId);

      this.logger.log(
        `Successfully processed fulfillment expiry for escrow ${escrowId}`,
      );
      return { success: true, message: 'Escrow expired and refunded' };
    } catch (error) {
      this.logger.error(
        `Failed to process fulfillment expiry for ${escrowId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Handle 24h auto-release after delivery
   * Called 24 hours after delivery code was verified
   * Action: Auto-complete escrow if no dispute was raised
   */
  private async handleAutoRelease(
    data: CheckAutoReleasePayload,
  ): Promise<{ success: boolean; message: string }> {
    const { escrowId } = data;

    this.logger.log(`Processing auto-release for escrow ${escrowId}`);

    try {
      await this.escrowService.handleAutoRelease(escrowId);

      this.logger.log(`Successfully auto-released escrow ${escrowId}`);
      return { success: true, message: 'Escrow auto-completed' };
    } catch (error) {
      this.logger.error(
        `Failed to process auto-release for ${escrowId}: ${error.message}`,
      );
      throw error;
    }
  }
}
