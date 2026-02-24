import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { User } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { VerificationDocument } from '../../database/entities/verification-document.entity';
import { KycVerification } from '../../database/entities/kyc-verification.entity';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { EmailService } from '../email/email.service';
import {
  USERS_QUEUE_NAME,
  UsersJobName,
  ProcessScheduledDeletionPayload,
  SendDeletionReminderPayload,
} from './interfaces/users-jobs.interface';

@Processor(USERS_QUEUE_NAME)
export class UsersProcessor extends WorkerHost {
  private readonly logger = new Logger(UsersProcessor.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(VerificationDocument)
    private verificationDocRepo: Repository<VerificationDocument>,
    @InjectRepository(KycVerification)
    private kycRepo: Repository<KycVerification>,
    @InjectRepository(EmailVerification)
    private emailVerificationRepo: Repository<EmailVerification>,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(
    job: Job<ProcessScheduledDeletionPayload | SendDeletionReminderPayload>,
  ): Promise<any> {
    this.logger.log(`Processing users job: ${job.name} (${job.id})`);

    try {
      switch (job.name) {
        case UsersJobName.PROCESS_SCHEDULED_DELETION:
          return this.handleProcessScheduledDeletion(
            job.data as ProcessScheduledDeletionPayload,
          );

        case UsersJobName.SEND_DELETION_REMINDER:
          return this.handleSendDeletionReminder(
            job.data as SendDeletionReminderPayload,
          );

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Users job ${job.name} failed: ${error}`);
      throw error;
    }
  }

  /**
   * Process final deletion after grace period
   * - Anonymize user data
   * - Clear PII fields
   * - Hard delete verification documents, KYC records, email verifications
   * - Mark user as deleted
   */
  private async handleProcessScheduledDeletion(
    data: ProcessScheduledDeletionPayload,
  ): Promise<{ success: boolean; message: string }> {
    const { userId } = data;

    this.logger.log(`Processing scheduled deletion for user ${userId}`);

    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      this.logger.warn(`User ${userId} not found for scheduled deletion`);
      return { success: false, message: 'User not found' };
    }

    // Check if deletion was cancelled (user logged in during grace period)
    if (!user.isDeactivated) {
      this.logger.log(`User ${userId} deletion was cancelled, skipping`);
      return { success: false, message: 'Deletion was cancelled' };
    }

    // Already deleted
    if (user.isDeleted) {
      this.logger.log(`User ${userId} is already deleted`);
      return { success: false, message: 'User already deleted' };
    }

    // Generate anonymized values
    const anonymizedEmail = `deleted_${this.hashValue(user.email)}@deleted.campushub.ng`;
    const anonymizedPhone = `deleted_${this.hashValue(user.phone)}`;

    // 1. Anonymize user data
    await this.userRepo.update(userId, {
      fullName: 'Deleted User',
      email: anonymizedEmail,
      phone: anonymizedPhone,
      profilePhotoUrl: undefined,
      bio: undefined,
      schoolEmail: undefined,
      deviceId: undefined,
      isDeleted: true,
      deletedAt: new Date(),
      isDeactivated: false,
      scheduledDeletionAt: undefined,
    });

    // 2. Clear wallet bank details
    await this.walletRepo.update(
      { userId },
      {
        bankAccountNumber: undefined,
        bankCode: undefined,
        bankName: undefined,
        bankAccountName: undefined,
        paystackRecipientCode: undefined,
      },
    );

    // 3. Hard delete verification documents
    await this.verificationDocRepo.delete({ userId });

    // 4. Hard delete KYC records
    await this.kycRepo.delete({ userId });

    // 5. Hard delete email verifications
    await this.emailVerificationRepo.delete({ userId });

    this.logger.log(`Successfully processed deletion for user ${userId}`);

    return { success: true, message: 'Account permanently deleted' };
  }

  /**
   * Send deletion reminder email 3 days before deletion
   */
  private async handleSendDeletionReminder(
    data: SendDeletionReminderPayload,
  ): Promise<{ success: boolean; message: string }> {
    const { userId, email, fullName, scheduledDeletionAt } = data;

    this.logger.log(`Sending deletion reminder to ${email} for user ${userId}`);

    // Check if deletion was cancelled
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user || !user.isDeactivated) {
      this.logger.log(`User ${userId} deletion was cancelled, skipping reminder`);
      return { success: false, message: 'Deletion was cancelled' };
    }

    try {
      await this.emailService.sendAccountDeletionReminderEmail(
        email,
        fullName,
        new Date(scheduledDeletionAt),
        3,
      );

      this.logger.log(`Deletion reminder sent successfully to ${email}`);
      return { success: true, message: 'Reminder sent' };
    } catch (error) {
      this.logger.error(`Failed to send deletion reminder: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Hash a value for anonymization (first 12 chars of SHA256)
   */
  private hashValue(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex').substring(0, 12);
  }
}
