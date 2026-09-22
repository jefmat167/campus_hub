import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import {
  KycVerification,
  KycType,
  KycStatus,
} from '../../database/entities/kyc-verification.entity';
import {
  User,
  VerificationTier,
} from '../../database/entities/user.entity';
import { WalletTransactionType } from '../../database/entities/wallet.entity';
import { PlatformTransactionType } from '../../database/entities/platform-wallet.entity';
import { WalletService } from '../wallet/wallet.service';
import { PlatformWalletService } from '../wallet/platform-wallet.service';

export interface YouVerifyBvnResponse {
  success: boolean;
  data?: {
    firstName: string;
    lastName: string;
    middleName?: string;
    dateOfBirth: string;
    phoneNumber: string;
    bvn: string;
  };
  message?: string;
}

export interface YouVerifyNinResponse {
  success: boolean;
  data?: {
    firstName: string;
    lastName: string;
    middleName?: string;
    dateOfBirth: string;
    gender: string;
    nin: string;
  };
  message?: string;
}

export interface KycVerificationResult {
  success: boolean;
  message: string;
  verificationId?: string;
  verifiedAt?: Date;
  tier2Achieved?: boolean;
}

const KYC_FEE = 100; // ₦100 fee for KYC verification (naira)
const KYC_FEE_INSUFFICIENT = `Insufficient wallet balance. KYC verification requires ₦${KYC_FEE}. Please fund your wallet.`;

@Injectable()
export class YouVerifyService {
  private readonly logger = new Logger(YouVerifyService.name);
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly isDevelopment: boolean;

  constructor(
    @InjectRepository(KycVerification)
    private kycRepo: Repository<KycVerification>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private configService: ConfigService,
    private dataSource: DataSource,
    private walletService: WalletService,
    private platformWalletService: PlatformWalletService,
  ) {
    this.apiKey = this.configService.get<string>('YOUVERIFY_API_KEY', '');
    this.baseUrl = this.configService.get<string>(
      'YOUVERIFY_BASE_URL',
      'https://api.youverify.co/v2/api',
    );
    this.isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development';

    if (!this.apiKey && !this.isDevelopment) {
      this.logger.warn(
        'YouVerify API key not configured. KYC verification will not work.',
      );
    }
  }

  /**
   * Verify BVN using YouVerify API
   */
  async verifyBvn(userId: string, bvn: string): Promise<KycVerificationResult> {
    return this.verifyKyc(userId, KycType.BVN, bvn);
  }

  /**
   * Verify NIN using YouVerify API
   */
  async verifyNin(userId: string, nin: string): Promise<KycVerificationResult> {
    return this.verifyKyc(userId, KycType.NIN, nin);
  }

  /**
   * Main KYC verification logic
   */
  private async verifyKyc(
    userId: string,
    type: KycType,
    value: string,
  ): Promise<KycVerificationResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if user is at least Tier 1
    if (
      user.verificationTier !== VerificationTier.TIER_1 &&
      user.verificationTier !== VerificationTier.TIER_2
    ) {
      throw new BadRequestException(
        'You must complete student verification (Tier 1) before KYC verification',
      );
    }

    // Check if already verified this type
    if (
      (type === KycType.BVN && user.bvnVerified) ||
      (type === KycType.NIN && user.ninVerified)
    ) {
      return {
        success: true,
        message: `${type.toUpperCase()} is already verified`,
      };
    }

    // Check attempt count (max 3)
    if (user.kycAttemptCount >= 3) {
      throw new BadRequestException(
        'Maximum KYC verification attempts reached (3). Please contact support.',
      );
    }

    // Check wallet balance for the fee up front (only the first Tier-2 upgrade
    // pays) so a student never burns one of their 3 attempts on a check they
    // cannot pay for.
    if (user.verificationTier !== VerificationTier.TIER_2) {
      await this.assertCanPayKycFee(userId);
    }

    // Create KYC verification record
    const verification = this.kycRepo.create({
      userId,
      type,
      status: KycStatus.PENDING,
      attemptNumber: user.kycAttemptCount + 1,
    });

    // Perform verification
    let result: { success: boolean; message: string; reference?: string };

    if (this.isDevelopment) {
      // Mock verification in development
      result = await this.mockVerify(type, value, user);
    } else {
      result = await this.callYouVerifyApi(type, value, user);
    }

    // Update verification record
    verification.status = result.success ? KycStatus.SUCCESS : KycStatus.FAILED;
    verification.youverifyReference = result.reference || null;
    verification.failureReason = result.success ? null : result.message;
    verification.verifiedAt = result.success ? new Date() : null;

    await this.kycRepo.save(verification);

    // Update user
    user.kycAttemptCount += 1;

    if (result.success) {
      // Use transaction to update user and charge fee
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        // Update user verification status
        if (type === KycType.BVN) {
          user.bvnVerified = true;
        } else {
          user.ninVerified = true;
        }

        // Upgrade to Tier 2 if first KYC verification
        let tier2Achieved = false;
        if (user.verificationTier === VerificationTier.TIER_1) {
          user.verificationTier = VerificationTier.TIER_2;
          user.tier2VerifiedAt = new Date();
          tier2Achieved = true;

          // Charge the one-time KYC fee for the first upgrade to Tier 2: a real
          // ledger row on the student's wallet (type `fee`) and the matching
          // credit on the platform wallet, both on THIS transaction so a
          // failure leaves neither side half-applied.
          await this.chargeKycFee(queryRunner, userId, type, verification.id);
        }

        await queryRunner.manager.save(user);
        await queryRunner.commitTransaction();

        return {
          success: true,
          message: tier2Achieved
            ? `${type.toUpperCase()} verified successfully! You are now Tier 2 verified.`
            : `${type.toUpperCase()} verified successfully!`,
          verificationId: verification.id,
          verifiedAt: verification.verifiedAt!,
          tier2Achieved,
        };
      } catch (error) {
        await queryRunner.rollbackTransaction();
        throw error;
      } finally {
        await queryRunner.release();
      }
    } else {
      await this.userRepo.save(user);

      return {
        success: false,
        message: result.message,
        verificationId: verification.id,
      };
    }
  }

  /**
   * Add second KYC type (for users who already have Tier 2)
   * No fee charged for adding second type
   */
  async addSecondKycType(
    userId: string,
    type: KycType,
    value: string,
  ): Promise<KycVerificationResult> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Must be Tier 2 to add second type
    if (user.verificationTier !== VerificationTier.TIER_2) {
      throw new BadRequestException(
        'You must be Tier 2 verified to add a second verification type',
      );
    }

    // Check if already verified this type
    if (
      (type === KycType.BVN && user.bvnVerified) ||
      (type === KycType.NIN && user.ninVerified)
    ) {
      return {
        success: true,
        message: `${type.toUpperCase()} is already verified`,
      };
    }

    // Create verification record
    const verification = this.kycRepo.create({
      userId,
      type,
      status: KycStatus.PENDING,
      attemptNumber: 1,
    });

    // Perform verification
    let result: { success: boolean; message: string; reference?: string };

    if (this.isDevelopment) {
      result = await this.mockVerify(type, value, user);
    } else {
      result = await this.callYouVerifyApi(type, value, user);
    }

    // Update verification record
    verification.status = result.success ? KycStatus.SUCCESS : KycStatus.FAILED;
    verification.youverifyReference = result.reference || null;
    verification.failureReason = result.success ? null : result.message;
    verification.verifiedAt = result.success ? new Date() : null;

    await this.kycRepo.save(verification);

    if (result.success) {
      if (type === KycType.BVN) {
        user.bvnVerified = true;
      } else {
        user.ninVerified = true;
      }
      await this.userRepo.save(user);

      return {
        success: true,
        message: `${type.toUpperCase()} verified successfully! You now have the high trust badge.`,
        verificationId: verification.id,
        verifiedAt: verification.verifiedAt!,
      };
    }

    return {
      success: false,
      message: result.message,
      verificationId: verification.id,
    };
  }

  /**
   * Get KYC status for a user
   */
  async getKycStatus(userId: string): Promise<{
    tier: VerificationTier;
    bvnVerified: boolean;
    ninVerified: boolean;
    hasHighTrustBadge: boolean;
    attemptCount: number;
    remainingAttempts: number;
    canRetry: boolean;
    recentVerifications: KycVerification[];
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const recentVerifications = await this.kycRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 5,
    });

    return {
      tier: user.verificationTier,
      bvnVerified: user.bvnVerified,
      ninVerified: user.ninVerified,
      hasHighTrustBadge: user.bvnVerified && user.ninVerified,
      attemptCount: user.kycAttemptCount,
      remainingAttempts: Math.max(0, 3 - user.kycAttemptCount),
      canRetry:
        user.kycAttemptCount < 3 &&
        user.verificationTier === VerificationTier.TIER_1,
      recentVerifications,
    };
  }

  /** Pre-flight: the student can cover the fee (friendly 400 instead of a generic one). */
  private async assertCanPayKycFee(userId: string): Promise<void> {
    const wallet = await this.walletService.getWallet(userId).catch(() => null);
    if (!wallet || Number(wallet.availableBalance) < KYC_FEE) {
      throw new BadRequestException(KYC_FEE_INSUFFICIENT);
    }
  }

  /**
   * Debit the fee via WalletService (pessimistic wallet lock + `fee` ledger
   * row, reference `KYC_FEE_<kycVerificationId>`) and book it to the platform
   * wallet as `KYC_FEE` — on the caller's query runner.
   */
  private async chargeKycFee(
    queryRunner: QueryRunner,
    userId: string,
    type: KycType,
    kycVerificationId: string,
  ): Promise<void> {
    const reference = `KYC_FEE_${kycVerificationId}`;
    const label = type.toUpperCase();
    try {
      await this.walletService.debitWallet(
        userId,
        KYC_FEE,
        reference,
        WalletTransactionType.FEE,
        undefined,
        queryRunner,
        `KYC verification fee (${label} → Tier 2)`,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        /insufficient/i.test(error.message)
      ) {
        throw new BadRequestException(KYC_FEE_INSUFFICIENT);
      }
      throw error;
    }
    await this.platformWalletService.creditPlatformFee(
      KYC_FEE,
      null,
      PlatformTransactionType.KYC_FEE,
      `KYC verification fee — ${label}, user ${userId} (${reference})`,
      queryRunner,
    );
  }

  /**
   * Mock verification for development
   */
  private async mockVerify(
    type: KycType,
    value: string,
    user: User,
  ): Promise<{ success: boolean; message: string; reference?: string }> {
    this.logger.log('═══════════════════════════════════════════');
    this.logger.log(`🔐 MOCK KYC VERIFICATION (${type.toUpperCase()})`);
    this.logger.log(`User: ${user.fullName} (${user.id})`);
    this.logger.log(`${type.toUpperCase()}: ${value.substring(0, 3)}****`);
    this.logger.log('═══════════════════════════════════════════');

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Validate format
    if (type === KycType.BVN) {
      if (!/^\d{11}$/.test(value)) {
        return {
          success: false,
          message: 'Invalid BVN format. BVN must be 11 digits.',
        };
      }
    } else if (type === KycType.NIN) {
      if (!/^\d{11}$/.test(value)) {
        return {
          success: false,
          message: 'Invalid NIN format. NIN must be 11 digits.',
        };
      }
    }

    // In development, always succeed with valid format
    return {
      success: true,
      message: `${type.toUpperCase()} verified successfully (MOCK)`,
      reference: `MOCK-${type.toUpperCase()}-${Date.now()}`,
    };
  }

  /**
   * Call YouVerify API
   */
  private async callYouVerifyApi(
    type: KycType,
    value: string,
    user: User,
  ): Promise<{ success: boolean; message: string; reference?: string }> {
    const endpoint =
      type === KycType.BVN
        ? `${this.baseUrl}/identity/ng/bvn`
        : `${this.baseUrl}/identity/ng/nin`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: this.apiKey,
        },
        body: JSON.stringify({
          id: value,
          isSubjectConsent: true,
          metadata: {
            userId: user.id,
            requestedAt: new Date().toISOString(),
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          message: data.message || `${type.toUpperCase()} verification failed`,
          reference: data.requestId,
        };
      }

      // Verify the response data matches user's name (basic fraud check)
      // This is optional and depends on your requirements
      const verifiedData = data.data;

      if (verifiedData) {
        // You could add name matching logic here
        // const nameParts = user.fullName.toLowerCase().split(' ');
        // const verifiedFirstName = verifiedData.firstName?.toLowerCase();
        // const verifiedLastName = verifiedData.lastName?.toLowerCase();
      }

      return {
        success: true,
        message: `${type.toUpperCase()} verified successfully`,
        reference: data.requestId,
      };
    } catch (error) {
      this.logger.error(`YouVerify API error: ${error}`);
      return {
        success: false,
        message: 'Verification service temporarily unavailable. Please try again later.',
      };
    }
  }
}
