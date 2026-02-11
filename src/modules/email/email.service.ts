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
import { ResendService } from './resend.service';

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

  constructor(
    @InjectRepository(EmailVerification)
    private emailVerificationRepo: Repository<EmailVerification>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly resendService: ResendService,
    private configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.getOrThrow('FRONTEND_URL');
  }

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

    const result = await this.sendVerificationEmailInternal(
      email,
      type,
      verification.token,
      user.fullName,
    );

    if (!result.success) {
      this.logger.error(`Failed to send verification email: ${result.error}`);
    }

    return {
      sent: result.success,
      message: result.success
        ? `Verification email sent to ${email}`
        : `Failed to send email: ${result.error}`,
      remainingAttempts: verification.remainingResendAttempts,
      expiresAt: verification.expiresAt,
    };
  }

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
    const result = await this.sendVerificationEmailInternal(
      verification.email,
      type,
      verification.token,
      user?.fullName || 'User',
    );

    return {
      sent: result.success,
      message: result.success
        ? `Verification email resent to ${verification.email}`
        : `Failed to send email: ${result.error}`,
      remainingAttempts: verification.remainingResendAttempts,
      expiresAt: verification.expiresAt,
    };
  }

  async isEmailVerified(
    userId: string,
    type: EmailVerificationType,
  ): Promise<boolean> {
    const verification = await this.emailVerificationRepo.findOne({
      where: { userId, type },
    });

    return verification?.isVerified ?? false;
  }

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

  async sendPasswordResetEmail(
    email: string,
    token: string,
    userName: string,
  ): Promise<void> {
    const resetUrl = `${this.frontendUrl}/auth/reset-password?token=${encodeURIComponent(token)}`;

    const result = await this.resendService.sendEmail({
      to: email,
      subject: 'Reset your CampusHub password',
      template: 'resetPassword',
      context: {
        resetUrl,
        name: userName ?? null,
      },
    });

    if (!result.success) {
      this.logger.error(
        `Failed to send password reset email to ${email}: ${result.error}`,
      );
    }
  }

  private calculateExpiry(type: EmailVerificationType): Date {
    const now = new Date();
    const hours = type === EmailVerificationType.PERSONAL ? 1 : 2;
    return new Date(now.getTime() + hours * 60 * 60 * 1000);
  }

  private async sendVerificationEmailInternal(
    email: string,
    type: EmailVerificationType,
    token: string,
    userName: string,
  ) {
    const verificationUrl = `${this.frontendUrl}/auth/verify-email?token=${encodeURIComponent(token)}`;
    const subject =
      type === EmailVerificationType.PERSONAL
        ? 'Verify your CampusHub email'
        : 'Verify your school email - CampusHub';

    return this.resendService.sendEmail({
      to: email,
      subject,
      template: 'verifyEmail',
      context: {
        verifyUrl: verificationUrl,
        name: userName ?? null,
      },
    });
  }
}
