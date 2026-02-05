import { EmailVerificationType } from '../../../database/entities/email-verification.entity';

export interface SendOtpJobData {
  phoneNumber: string;
  purpose: string;
}

export interface SendVerificationEmailJobData {
  userId: string;
  email: string;
  type: EmailVerificationType;
}

export type AuthJobData = SendOtpJobData | SendVerificationEmailJobData;

export const AUTH_QUEUE_NAME = 'auth';

export enum AuthJobName {
  SEND_OTP = 'send-otp',
  SEND_VERIFICATION_EMAIL = 'send-verification-email',
}
