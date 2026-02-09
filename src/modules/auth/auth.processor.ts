import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { SmsService } from '../sms/sms.service';
import { EmailService } from '../email/email.service';
import {
  SendOtpJobData,
  SendVerificationEmailJobData,
  AUTH_QUEUE_NAME,
  AuthJobName,
} from './interfaces/auth-jobs.interface';

@Processor(AUTH_QUEUE_NAME)
export class AuthProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthProcessor.name);

  constructor(
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async process(
    job: Job<SendOtpJobData | SendVerificationEmailJobData>,
  ): Promise<any> {
    this.logger.log(`Processing auth job: ${job.name} (${job.id})`);

    try {
      switch (job.name) {
        case AuthJobName.SEND_OTP:
          return this.handleSendOtp(job.data as SendOtpJobData);

        case AuthJobName.SEND_VERIFICATION_EMAIL:
          return this.handleSendVerificationEmail(
            job.data as SendVerificationEmailJobData,
          );

        default:
          this.logger.warn(`Unknown job type: ${job.name}`);
          return null;
      }
    } catch (error) {
      this.logger.error(`Auth job ${job.name} failed: ${error}`);
      throw error;
    }
  }

  private async handleSendOtp(
    data: SendOtpJobData,
  ): Promise<{ sent: boolean; message?: string }> {
    const { phoneNumber, purpose } = data;

    this.logger.log(`Sending OTP to ${phoneNumber} for ${purpose}`);

    try {
      const result = await this.smsService.sendOtp(phoneNumber, purpose);
      this.logger.log(`OTP sent successfully to ${phoneNumber}`);
      return { sent: true, message: result.message };
    } catch (error) {
      this.logger.error(`Failed to send OTP to ${phoneNumber}: ${error.message}`);
      return { sent: false, message: error.message };
    }
  }

  private async handleSendVerificationEmail(
    data: SendVerificationEmailJobData,
  ): Promise<{ sent: boolean; message?: string }> {
    const { userId, email, type } = data;

    this.logger.log(`Sending verification email to ${email} for user ${userId}`);

    try {
      const result = await this.emailService.sendVerificationEmail(
        userId,
        email,
        type,
      );
      this.logger.log(`Verification email sent successfully to ${email}`);
      this.logger.log(`Verification email result`);
      console.dir(result, { depth: null });
      return { sent: result.sent, message: result.message };
    } catch (error) {
      this.logger.error(
        `Failed to send verification email to ${email}: ${error.message}`,
      );
      return { sent: false, message: error.message };
    }
  }
}
