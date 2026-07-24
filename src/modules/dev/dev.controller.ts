import {
  Controller,
  Post,
  Param,
  Body,
  NotFoundException,
  ForbiddenException,
  Get,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  User,
  VerificationTier,
  Tier1ReviewStatus,
  Gender,
} from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';

/**
 * Development-only controller for testing verification flows.
 * All endpoints are disabled in production.
 */
@ApiTags('Dev (Development Only)')
@Controller('dev')
export class DevController {
  private readonly isDevelopment: boolean;

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    private configService: ConfigService,
  ) {
    this.isDevelopment =
      this.configService.get<string>('NODE_ENV') !== 'production';
  }

  private checkDevMode() {
    if (!this.isDevelopment) {
      throw new ForbiddenException('This endpoint is only available in development mode');
    }
  }

  /**
   * Get user's current verification status
   */
  @ApiOperation({ summary: 'Get user verification status and limits' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 200,
    description: 'User verification status retrieved successfully',
    schema: {
      example: {
        userId: '550e8400-e29b-41d4-a716-446655440000',
        email: 'user@test.com',
        phone: '+2348012345678',
        fullName: 'Test User',
        verificationTier: 'tier_1',
        phoneVerified: true,
        emailVerified: true,
        schoolEmail: null,
        schoolEmailVerified: false,
        tier1ReviewStatus: 'approved',
        bvnVerified: false,
        ninVerified: false,
        limits: { buying: 60000, selling: 50000, housing: 50000 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Get('users/:userId/verification-status')
  async getVerificationStatus(@Param('userId') userId: string) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      userId: user.id,
      email: user.email,
      phone: user.phone,
      fullName: user.fullName,
      verificationTier: user.verificationTier,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      schoolEmail: user.schoolEmail,
      schoolEmailVerified: user.schoolEmailVerified,
      tier1ReviewStatus: user.tier1ReviewStatus,
      bvnVerified: user.bvnVerified,
      ninVerified: user.ninVerified,
      limits: {
        buying: user.buyingLimit,
        selling: user.sellingLimit,
        housing: user.housingListingLimit,
      },
    };
  }

  /**
   * Set user's verification tier directly
   */
  @ApiOperation({ summary: 'Set user verification tier directly' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({ schema: { example: { tier: 'tier_0' } } })
  @ApiResponse({
    status: 201,
    description: 'User tier changed successfully',
    schema: {
      example: {
        message: 'User tier changed from none to tier_0',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        previousTier: 'none',
        newTier: 'tier_0',
        limits: { buying: 30000, selling: 0, housing: 0 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/set-tier')
  async setTier(
    @Param('userId') userId: string,
    @Body('tier') tier: VerificationTier,
  ) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const previousTier = user.verificationTier;

    // Set appropriate flags based on tier
    switch (tier) {
      case VerificationTier.TIER_2:
        user.verificationTier = VerificationTier.TIER_2;
        user.phoneVerified = true;
        user.phoneVerifiedAt = user.phoneVerifiedAt || new Date();
        user.emailVerified = true;
        user.emailVerifiedAt = user.emailVerifiedAt || new Date();
        user.tier1ReviewStatus = Tier1ReviewStatus.APPROVED;
        user.tier1ApprovedAt = user.tier1ApprovedAt || new Date();
        user.bvnVerified = true;
        user.tier2VerifiedAt = new Date();
        break;

      case VerificationTier.TIER_1:
        user.verificationTier = VerificationTier.TIER_1;
        user.phoneVerified = true;
        user.phoneVerifiedAt = user.phoneVerifiedAt || new Date();
        user.emailVerified = true;
        user.emailVerifiedAt = user.emailVerifiedAt || new Date();
        user.tier1ReviewStatus = Tier1ReviewStatus.APPROVED;
        user.tier1ApprovedAt = user.tier1ApprovedAt || new Date();
        break;

      case VerificationTier.TIER_0:
        user.verificationTier = VerificationTier.TIER_0;
        user.phoneVerified = true;
        user.phoneVerifiedAt = user.phoneVerifiedAt || new Date();
        user.emailVerified = true;
        user.emailVerifiedAt = user.emailVerifiedAt || new Date();
        break;

      case VerificationTier.NONE:
        user.verificationTier = VerificationTier.NONE;
        break;
    }

    await this.userRepo.save(user);

    return {
      message: `User tier changed from ${previousTier} to ${tier}`,
      userId: user.id,
      previousTier,
      newTier: user.verificationTier,
      limits: {
        buying: user.buyingLimit,
        selling: user.sellingLimit,
        housing: user.housingListingLimit,
      },
    };
  }

  /**
   * Upgrade user to next tier
   */
  @ApiOperation({ summary: 'Upgrade user to next verification tier' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 201,
    description: 'User tier upgraded successfully',
    schema: {
      example: {
        message: 'User tier changed from tier_0 to tier_1',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        previousTier: 'tier_0',
        newTier: 'tier_1',
        limits: { buying: 60000, selling: 50000, housing: 50000 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/upgrade-tier')
  async upgradeTier(@Param('userId') userId: string) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const tierOrder = [
      VerificationTier.NONE,
      VerificationTier.TIER_0,
      VerificationTier.TIER_1,
      VerificationTier.TIER_2,
    ];

    const currentIndex = tierOrder.indexOf(user.verificationTier);
    if (currentIndex >= tierOrder.length - 1) {
      return {
        message: 'User is already at maximum tier (TIER_2)',
        userId: user.id,
        currentTier: user.verificationTier,
      };
    }

    const nextTier = tierOrder[currentIndex + 1];
    return this.setTier(userId, nextTier);
  }

  /**
   * Mark phone as verified
   */
  @ApiOperation({ summary: 'Mark user phone as verified' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 201,
    description: 'Phone marked as verified',
    schema: {
      example: {
        message: 'Phone marked as verified',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        phoneVerified: true,
        verificationTier: 'none',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/verify-phone')
  async verifyPhone(@Param('userId') userId: string) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.phoneVerified = true;
    user.phoneVerifiedAt = new Date();

    await this.userRepo.save(user);

    return {
      message: 'Phone marked as verified',
      userId: user.id,
      phoneVerified: user.phoneVerified,
      verificationTier: user.verificationTier,
    };
  }

  /**
   * Mark email as verified
   */
  @ApiOperation({ summary: 'Mark user email as verified' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 201,
    description: 'Email marked as verified',
    schema: {
      example: {
        message: 'Email marked as verified',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        emailVerified: true,
        verificationTier: 'tier_0',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/verify-email')
  async verifyEmail(@Param('userId') userId: string) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();

    // Auto-upgrade to TIER_0 when email is verified
    if (user.verificationTier === VerificationTier.NONE) {
      user.verificationTier = VerificationTier.TIER_0;
    }

    await this.userRepo.save(user);

    return {
      message: 'Email marked as verified',
      userId: user.id,
      emailVerified: user.emailVerified,
      verificationTier: user.verificationTier,
    };
  }

  /**
   * Approve Tier 1 verification (student documents)
   */
  @ApiOperation({ summary: 'Approve Tier 1 verification (student documents)' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 201,
    description: 'Tier 1 approved successfully',
    schema: {
      example: {
        message: 'Tier 1 approved - user can now sell items',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        verificationTier: 'tier_1',
        tier1ReviewStatus: 'approved',
        limits: { buying: 60000, selling: 50000, housing: 50000 },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/approve-tier1')
  async approveTier1(@Param('userId') userId: string) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Ensure prerequisites are met
    if (!user.phoneVerified || !user.emailVerified) {
      user.phoneVerified = true;
      user.phoneVerifiedAt = user.phoneVerifiedAt || new Date();
      user.emailVerified = true;
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
    }

    user.tier1ReviewStatus = Tier1ReviewStatus.APPROVED;
    user.tier1ApprovedAt = new Date();
    user.tier1ApprovedBy = 'dev-controller';
    user.verificationTier = VerificationTier.TIER_1;

    await this.userRepo.save(user);

    return {
      message: 'Tier 1 approved - user can now sell items',
      userId: user.id,
      verificationTier: user.verificationTier,
      tier1ReviewStatus: user.tier1ReviewStatus,
      limits: {
        buying: user.buyingLimit,
        selling: user.sellingLimit,
        housing: user.housingListingLimit,
      },
    };
  }

  /**
   * Approve Tier 2 verification (KYC - BVN/NIN)
   */
  @ApiOperation({ summary: 'Approve Tier 2 verification (KYC - BVN/NIN)' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({ schema: { example: { type: 'bvn' } } })
  @ApiResponse({
    status: 201,
    description: 'Tier 2 approved successfully',
    schema: {
      example: {
        message: 'Tier 2 approved - user has unlimited access',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        verificationTier: 'tier_2',
        bvnVerified: true,
        ninVerified: false,
        hasHighTrustBadge: false,
        limits: { buying: null, selling: null, housing: null },
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/approve-tier2')
  async approveTier2(
    @Param('userId') userId: string,
    @Body('type') type: 'bvn' | 'nin' | 'both' = 'bvn',
  ) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Ensure Tier 1 prerequisites are met
    if (user.verificationTier === VerificationTier.NONE ||
        user.verificationTier === VerificationTier.TIER_0) {
      user.phoneVerified = true;
      user.phoneVerifiedAt = user.phoneVerifiedAt || new Date();
      user.emailVerified = true;
      user.emailVerifiedAt = user.emailVerifiedAt || new Date();
      user.tier1ReviewStatus = Tier1ReviewStatus.APPROVED;
      user.tier1ApprovedAt = user.tier1ApprovedAt || new Date();
    }

    if (type === 'bvn' || type === 'both') {
      user.bvnVerified = true;
    }
    if (type === 'nin' || type === 'both') {
      user.ninVerified = true;
    }

    user.tier2VerifiedAt = new Date();
    user.verificationTier = VerificationTier.TIER_2;

    await this.userRepo.save(user);

    return {
      message: 'Tier 2 approved - user has unlimited access',
      userId: user.id,
      verificationTier: user.verificationTier,
      bvnVerified: user.bvnVerified,
      ninVerified: user.ninVerified,
      hasHighTrustBadge: user.hasHighTrustBadge,
      limits: {
        buying: user.buyingLimit,
        selling: user.sellingLimit,
        housing: user.housingListingLimit,
      },
    };
  }

  /**
   * Reset user verification to NONE
   */
  @ApiOperation({ summary: 'Reset user verification to NONE' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 201,
    description: 'User verification reset successfully',
    schema: {
      example: {
        message: 'User verification reset to NONE',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        verificationTier: 'none',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/reset-verification')
  async resetVerification(@Param('userId') userId: string) {
    this.checkDevMode();

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.verificationTier = VerificationTier.NONE;
    user.phoneVerified = false;
    user.phoneVerifiedAt = null;
    user.emailVerified = false;
    user.emailVerifiedAt = null;
    user.schoolEmailVerified = false;
    user.schoolEmailVerifiedAt = null;
    user.tier1ReviewStatus = Tier1ReviewStatus.NOT_SUBMITTED;
    user.tier1ApprovedAt = null;
    user.tier1ApprovedBy = null;
    user.tier1RejectionCount = 0;
    user.tier1RejectionReason = null;
    user.bvnVerified = false;
    user.ninVerified = false;
    user.tier2VerifiedAt = null;
    user.kycAttemptCount = 0;

    await this.userRepo.save(user);

    return {
      message: 'User verification reset to NONE',
      userId: user.id,
      verificationTier: user.verificationTier,
    };
  }

  /**
   * Add funds to user's wallet (for testing purchases)
   */
  @ApiOperation({ summary: 'Add funds to user wallet for testing' })
  @ApiParam({ name: 'userId', description: 'UUID of the user', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiBody({ schema: { example: { amount: 100000 } } })
  @ApiResponse({
    status: 201,
    description: 'Funds added successfully',
    schema: {
      example: {
        message: 'Added ₦100,000 to wallet',
        userId: '550e8400-e29b-41d4-a716-446655440000',
        newBalance: 200000,
        availableBalance: 200000,
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @Post('users/:userId/add-funds')
  async addFunds(
    @Param('userId') userId: string,
    @Body('amount') amount: number = 100000,
  ) {
    this.checkDevMode();

    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found for user');
    }

    wallet.balance = Number(wallet.balance) + amount;
    await this.walletRepo.save(wallet);

    return {
      message: `Added ₦${amount.toLocaleString()} to wallet`,
      userId,
      newBalance: wallet.balance,
      availableBalance: wallet.availableBalance,
    };
  }

  /**
   * Create a test user with specified tier
   */
  @ApiOperation({ summary: 'Create a test user with specified tier' })
  @ApiBody({
    schema: {
      example: {
        tier: 'tier_0',
        universityId: '550e8400-e29b-41d4-a716-446655440000',
        facultyId: '550e8400-e29b-41d4-a716-446655440001',
        departmentId: '550e8400-e29b-41d4-a716-446655440002',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Test user created successfully',
    schema: {
      example: {
        message: 'Test user created at tier_0',
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'testuser1234567890@test.com',
          phone: '+2341234567890',
          fullName: 'Test User 1234567890',
          verificationTier: 'tier_0',
        },
        note: 'Password hash is invalid - use set-tier endpoints to configure user',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @Post('create-test-user')
  async createTestUser(
    @Body() body: {
      email?: string;
      phone?: string;
      fullName?: string;
      gender?: Gender;
      tier?: VerificationTier;
      universityId: string;
      facultyId: string;
      departmentId: string;
    },
  ) {
    this.checkDevMode();

    const timestamp = Date.now();
    const email = body.email || `testuser${timestamp}@test.com`;
    const phone = body.phone || `+234${timestamp.toString().slice(-10)}`;
    const fullName = body.fullName || `Test User ${timestamp}`;
    const tier = body.tier || VerificationTier.TIER_0;

    // Create user
    const user = this.userRepo.create({
      email,
      phone,
      fullName,
      gender: body.gender || Gender.MALE,
      passwordHash: '$2b$12$test.hash.for.development.only', // Not a real hash
      universityId: body.universityId,
      facultyId: body.facultyId,
      departmentId: body.departmentId,
      verificationTier: VerificationTier.NONE,
    });

    await this.userRepo.save(user);

    // Create wallet
    const wallet = this.walletRepo.create({
      userId: user.id,
      balance: 0,
      lockedBalance: 0,
    });
    await this.walletRepo.save(wallet);

    // Set tier if requested
    if (tier !== VerificationTier.NONE) {
      await this.setTier(user.id, tier);
    }

    // Reload user to get updated tier info
    const updatedUser = await this.userRepo.findOne({ where: { id: user.id } });

    return {
      message: `Test user created at ${tier}`,
      user: {
        id: updatedUser!.id,
        email: updatedUser!.email,
        phone: updatedUser!.phone,
        fullName: updatedUser!.fullName,
        verificationTier: updatedUser!.verificationTier,
      },
      note: 'Password hash is invalid - use set-tier endpoints to configure user',
    };
  }

  /**
   * List all available dev endpoints
   */
  @ApiOperation({ summary: 'List all available dev endpoints' })
  @ApiResponse({ status: 200, description: 'List of available dev endpoints' })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @Get('help')
  getHelp() {
    this.checkDevMode();

    return {
      message: 'Development endpoints for testing verification flows',
      warning: 'These endpoints are DISABLED in production',
      endpoints: [
        {
          method: 'GET',
          path: '/dev/users/:userId/verification-status',
          description: 'Get user verification status and limits',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/set-tier',
          body: { tier: 'none | tier_0 | tier_1 | tier_2' },
          description: 'Set user tier directly',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/upgrade-tier',
          description: 'Upgrade user to next tier',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/verify-phone',
          description: 'Mark phone as verified',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/verify-email',
          description: 'Mark email as verified',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/approve-tier1',
          description: 'Approve Tier 1 (student documents)',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/approve-tier2',
          body: { type: 'bvn | nin | both' },
          description: 'Approve Tier 2 (KYC verification)',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/reset-verification',
          description: 'Reset user to TIER_NONE',
        },
        {
          method: 'POST',
          path: '/dev/users/:userId/add-funds',
          body: { amount: 100000 },
          description: 'Add funds to user wallet',
        },
        {
          method: 'POST',
          path: '/dev/create-test-user',
          body: {
            email: 'optional',
            phone: 'optional',
            fullName: 'optional',
            tier: 'none | tier_0 | tier_1 | tier_2',
            universityId: 'required',
            facultyId: 'required',
            departmentId: 'required',
          },
          description: 'Create a test user at specified tier',
        },
      ],
      tierInfo: {
        none: 'Browse only',
        tier_0: 'Phone + Email verified: Buy ≤₦30k, chat, posts, fund wallet',
        tier_1: 'Documents approved: Sell ≤₦30k, buy ≤₦60k, housing ≤₦50k/month',
        tier_2: 'KYC verified: Unlimited access',
      },
    };
  }
}
