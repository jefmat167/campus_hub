import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  EmailVerification,
  EmailVerificationType,
} from '../../database/entities/email-verification.entity';
import { User, VerificationTier } from '../../database/entities/user.entity';

export interface SendVerificationEmailResult {
  sent: boolean;
  message: string;
  remainingAttempts?: number;
  expiresAt?: Date;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly frontendUrl: string;
  private readonly fromEmail: string;
  private readonly isDevelopment: boolean;

  constructor(
    @InjectRepository(EmailVerification)
    private emailVerificationRepo: Repository<EmailVerification>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    this.fromEmail = this.configService.get<string>(
      'FROM_EMAIL',
      'noreply@campushub.ng',
    );
    this.isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';
  }

  /**
   * Send verification email (personal or school)
   */
  async sendVerificationEmail(
    userId: string,
    email: string,
    type: EmailVerificationType,
  ): Promise<SendVerificationEmailResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check for existing verification record
    let verification = await this.emailVerificationRepo.findOne({
      where: { userId, type },
    });

    if (verification) {
      // Check if already verified
      if (verification.isVerified) {
        return {
          sent: false,
          message: `${type === EmailVerificationType.PERSONAL ? 'Email' : 'School email'} is already verified`,
        };
      }

      // Check resend limit
      if (!verification.canResend) {
        throw new BadRequestException(
          'Maximum resend attempts reached. Please contact support.',
        );
      }

      // Update existing record
      verification.email = email;
      verification.token = uuidv4();
      verification.expiresAt = this.calculateExpiry(type);
      verification.resendCount += 1;
    } else {
      // Create new verification record
      verification = this.emailVerificationRepo.create({
        userId,
        email,
        type,
        token: uuidv4(),
        expiresAt: this.calculateExpiry(type),
        resendCount: 0,
      });
    }

    await this.emailVerificationRepo.save(verification);

    // Send the email
    await this.sendEmail(email, type, verification.token, user.fullName);

    return {
      sent: true,
      message: `Verification email sent to ${email}`,
      remainingAttempts: verification.remainingResendAttempts,
      expiresAt: verification.expiresAt,
    };
  }

  /**
   * Verify email token
   */
  async verifyEmailToken(token: string): Promise<{
    verified: boolean;
    type: EmailVerificationType;
    userId: string;
    email: string;
    tierUpdated?: boolean;
    newTier?: VerificationTier;
  }> {
    const verification = await this.emailVerificationRepo.findOne({
      where: { token },
      relations: ['user'],
    });

    if (!verification) {
      throw new BadRequestException('Invalid verification token');
    }

    if (verification.isVerified) {
      return {
        verified: true,
        type: verification.type,
        userId: verification.userId,
        email: verification.email,
      };
    }

    if (verification.isExpired) {
      throw new BadRequestException(
        'Verification link has expired. Please request a new one.',
      );
    }

    // Mark as verified
    verification.verifiedAt = new Date();
    await this.emailVerificationRepo.save(verification);

    // Update user based on verification type
    const user = verification.user;
    let tierUpdated = false;
    let newTier: VerificationTier | undefined;

    if (verification.type === EmailVerificationType.PERSONAL) {
      user.emailVerified = true;
      user.emailVerifiedAt = new Date();

      // Check if user can be upgraded to Tier 0
      if (
        user.phoneVerified &&
        user.emailVerified &&
        user.verificationTier === VerificationTier.NONE
      ) {
        user.verificationTier = VerificationTier.TIER_0;
        tierUpdated = true;
        newTier = VerificationTier.TIER_0;
      }
    } else if (verification.type === EmailVerificationType.SCHOOL) {
      user.schoolEmail = verification.email;
      user.schoolEmailVerified = true;
      user.schoolEmailVerifiedAt = new Date();
    }

    await this.userRepo.save(user);

    return {
      verified: true,
      type: verification.type,
      userId: verification.userId,
      email: verification.email,
      tierUpdated,
      newTier,
    };
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(
    userId: string,
    type: EmailVerificationType,
  ): Promise<SendVerificationEmailResult> {
    const verification = await this.emailVerificationRepo.findOne({
      where: { userId, type },
    });

    if (!verification) {
      throw new BadRequestException('No pending verification found');
    }

    if (verification.isVerified) {
      return {
        sent: false,
        message: 'Email is already verified',
      };
    }

    if (!verification.canResend) {
      throw new BadRequestException(
        'Maximum resend attempts reached (3). Please contact support.',
      );
    }

    // Generate new token and update expiry
    verification.token = uuidv4();
    verification.expiresAt = this.calculateExpiry(type);
    verification.resendCount += 1;

    await this.emailVerificationRepo.save(verification);

    // Get user for name
    const user = await this.userRepo.findOne({ where: { id: userId } });

    // Send the email
    await this.sendEmail(
      verification.email,
      type,
      verification.token,
      user?.fullName || 'User',
    );

    return {
      sent: true,
      message: `Verification email resent to ${verification.email}`,
      remainingAttempts: verification.remainingResendAttempts,
      expiresAt: verification.expiresAt,
    };
  }

  /**
   * Check if email is verified
   */
  async isEmailVerified(
    userId: string,
    type: EmailVerificationType,
  ): Promise<boolean> {
    const verification = await this.emailVerificationRepo.findOne({
      where: { userId, type },
    });

    return verification?.isVerified ?? false;
  }

  /**
   * Get verification status
   */
  async getVerificationStatus(
    userId: string,
    type: EmailVerificationType,
  ): Promise<{
    exists: boolean;
    verified: boolean;
    email?: string;
    expiresAt?: Date;
    remainingAttempts?: number;
  }> {
    const verification = await this.emailVerificationRepo.findOne({
      where: { userId, type },
    });

    if (!verification) {
      return { exists: false, verified: false };
    }

    return {
      exists: true,
      verified: verification.isVerified,
      email: verification.email,
      expiresAt: verification.isVerified ? undefined : verification.expiresAt,
      remainingAttempts: verification.isVerified
        ? undefined
        : verification.remainingResendAttempts,
    };
  }

  /**
   * Calculate expiry based on type
   * Personal: 1 hour, School: 2 hours
   */
  private calculateExpiry(type: EmailVerificationType): Date {
    const now = new Date();
    const hours = type === EmailVerificationType.PERSONAL ? 1 : 2;
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  /**
   * Send the actual email
   * In development, logs to console. In production, uses email provider.
   */
  private async sendEmail(
    email: string,
    type: EmailVerificationType,
    token: string,
    userName: string,
  ): Promise<void> {
    const verificationUrl = `${this.frontendUrl}/auth/verify-email?token=${token}`;
    const subject =
      type === EmailVerificationType.PERSONAL
        ? 'Verify your CampusHub email'
        : 'Verify your school email - CampusHub';

    const emailContent = this.generateEmailContent(
      type,
      userName,
      verificationUrl,
    );

    if (this.isDevelopment) {
      // In development, log to console
      this.logger.log('═══════════════════════════════════════════');
      this.logger.log(`📧 EMAIL VERIFICATION (${type.toUpperCase()})`);
      this.logger.log(`To: ${email}`);
      this.logger.log(`Subject: ${subject}`);
      this.logger.log(`Verification URL: ${verificationUrl}`);
      this.logger.log(`Token: ${token}`);
      this.logger.log('═══════════════════════════════════════════');
      return;
    }

    // TODO: Integrate with email provider (SendGrid, Mailgun, AWS SES, etc.)
    // For now, just log a warning
    this.logger.warn(
      `Email sending not configured. Would send to: ${email}, Subject: ${subject}`,
    );

    // Example SendGrid integration:
    // const sgMail = require('@sendgrid/mail');
    // sgMail.setApiKey(this.configService.get('SENDGRID_API_KEY'));
    // await sgMail.send({
    //   to: email,
    //   from: this.fromEmail,
    //   subject,
    //   html: emailContent,
    // });
  }

  /**
   * Generate email HTML content
   */
  private generateEmailContent(
    type: EmailVerificationType,
    userName: string,
    verificationUrl: string,
  ): string {
    const expiryText =
      type === EmailVerificationType.PERSONAL ? '1 hour' : '2 hours';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Email Verification - CampusHub</title>
      </head>
      <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Hello ${userName},</h1>

        <p>
          ${
            type === EmailVerificationType.PERSONAL
              ? 'Thank you for registering on CampusHub! Please verify your email address to continue.'
              : 'Please verify your school email address to complete your student verification.'
          }
        </p>

        <p style="margin: 30px 0;">
          <a href="${verificationUrl}"
             style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Verify Email
          </a>
        </p>

        <p style="color: #666; font-size: 14px;">
          This link will expire in ${expiryText}. If you didn't request this verification, please ignore this email.
        </p>

        <p style="color: #666; font-size: 14px;">
          If the button doesn't work, copy and paste this link into your browser:<br>
          <a href="${verificationUrl}" style="color: #4CAF50;">${verificationUrl}</a>
        </p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          CampusHub - Your University Marketplace
        </p>
      </body>
      </html>
    `;
  }
}
