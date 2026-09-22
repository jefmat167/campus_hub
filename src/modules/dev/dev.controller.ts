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
import * as bcrypt from 'bcrypt';
import {
  User,
  VerificationTier,
  Tier1ReviewStatus,
  Gender,
  AccountType,
} from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { VendorDeliveryPoint } from '../../database/entities/vendor-delivery-point.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';

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
    @InjectRepository(VendorProfile)
    private vendorProfileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    @InjectRepository(VendorDeliveryPoint)
    private vendorDeliveryPointRepo: Repository<VendorDeliveryPoint>,
    @InjectRepository(DropPoint)
    private dropPointRepo: Repository<DropPoint>,
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
   * Create a ready-to-sell test vendor (rev-2 Phase 7): vendor-only account
   * with a REAL password hash (you can log in), a funded dev wallet, and an
   * ACTIVE profile serving the given universities — the whole Door-2 +
   * admin-approval dance skipped.
   */
  @ApiOperation({ summary: 'Create an ACTIVE test vendor (login-ready)' })
  @ApiBody({
    schema: {
      example: {
        businessName: 'Test Chop Bar',
        homeUniversityId: '550e8400-e29b-41d4-a716-446655440000',
        servedUniversityIds: ['550e8400-e29b-41d4-a716-446655440000'],
        shopAddress: 'Shop 3, Campus Plaza',
        doorDeliveryFee: 'optional naira (default 500; null = no door delivery)',
        serviceTravelFee: 'optional naira (default 1000; null = at-shop only)',
        email: 'optional',
        phone: 'optional',
        password: 'optional (default DevPass123!)',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'Test vendor created (profile already ACTIVE) with a default delivery preset per served campus: ' +
      'door delivery on the home campus, service travel everywhere, and the first active admin drop point at ₦300',
    schema: {
      example: {
        message: 'Test vendor created and approved',
        user: { id: 'uuid', email: 'vendor123@test.com', accountType: 'vendor' },
        vendorProfileId: 'uuid',
        delivery: [
          {
            universityId: 'uuid',
            isHome: true,
            doorDeliveryFee: 500,
            serviceTravelFee: 1000,
            dropPoints: [{ dropPointId: 'uuid', name: 'Main Gate', fee: 300 }],
          },
        ],
        password: 'DevPass123!',
        note: 'Log in via POST /auth/login; catalog writes via /vendors/me/listings; delivery preset via GET/PUT /vendors/me/delivery',
      },
    },
  })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @Post('create-test-vendor')
  async createTestVendor(
    @Body()
    body: {
      businessName?: string;
      email?: string;
      phone?: string;
      password?: string;
      homeUniversityId: string;
      servedUniversityIds?: string[];
      shopAddress?: string;
      /** Naira; null = no door delivery. Default ₦500 on the home campus. */
      doorDeliveryFee?: number | null;
      /** Naira; null = at-shop only. Default ₦1,000 on every served campus. */
      serviceTravelFee?: number | null;
    },
  ) {
    this.checkDevMode();

    if (!body.homeUniversityId) {
      throw new NotFoundException('homeUniversityId is required');
    }

    const timestamp = Date.now();
    const businessName = body.businessName || `Test Vendor ${timestamp}`;
    const email = body.email || `vendor${timestamp}@test.com`;
    const phone = body.phone || `+234${timestamp.toString().slice(-10)}`;
    const password = body.password || 'DevPass123!';

    // Vendor-only account: no student identity (rev-2 spec 01.5).
    const user = this.userRepo.create({
      email,
      phone,
      fullName: businessName,
      gender: null,
      universityId: null,
      facultyId: null,
      departmentId: null,
      accountType: AccountType.VENDOR,
      verificationTier: VerificationTier.NONE,
      passwordHash: await bcrypt.hash(password, 12),
      emailVerified: true,
      emailVerifiedAt: new Date(),
      phoneVerified: true,
      phoneVerifiedAt: new Date(),
    });
    await this.userRepo.save(user);

    // Dev wallets start funded, mirroring dev vendor registration.
    await this.walletRepo.save(
      this.walletRepo.create({ userId: user.id, balance: 1000000 }),
    );

    const profile = this.vendorProfileRepo.create({
      userId: user.id,
      businessName,
      homeUniversityId: body.homeUniversityId,
      shopAddress: body.shopAddress ?? null,
      status: VendorStatus.ACTIVE,
      shopfrontPhotoUrl: 'https://cdn.example.com/dev-shopfront.jpg',
      photoCapturedLive: true,
      submittedAt: new Date(),
      reviewedAt: new Date(),
      reviewedBy: 'dev-controller',
    });
    await this.vendorProfileRepo.save(profile);

    // Served campuses double as the vendor's DELIVERY PRESET (2026-09-21
    // amendment to spec 03.2). Stamp usable defaults so the flow is testable
    // without visiting the settings screen: door delivery on the home campus,
    // service travel everywhere, and the first active admin drop point at
    // each campus (if admins have added any) at ₦300.
    const doorDeliveryFee =
      body.doorDeliveryFee === undefined ? 500 : body.doorDeliveryFee;
    const serviceTravelFee =
      body.serviceTravelFee === undefined ? 1000 : body.serviceTravelFee;
    const served = Array.from(
      new Set([body.homeUniversityId, ...(body.servedUniversityIds ?? [])]),
    );
    const delivery: Array<Record<string, unknown>> = [];
    for (const universityId of served) {
      const isHome = universityId === body.homeUniversityId;
      const row = await this.vendorUniversityRepo.save(
        this.vendorUniversityRepo.create({
          vendorProfileId: profile.id,
          universityId,
          doorDeliveryFee: isHome ? doorDeliveryFee : null,
          serviceTravelFee,
        }),
      );
      const dropPoint = await this.dropPointRepo.findOne({
        where: { universityId, isActive: true },
        order: { name: 'ASC' },
      });
      if (dropPoint) {
        await this.vendorDeliveryPointRepo.save(
          this.vendorDeliveryPointRepo.create({
            vendorUniversityId: row.id,
            dropPointId: dropPoint.id,
            fee: 300,
          }),
        );
      }
      delivery.push({
        universityId,
        isHome,
        doorDeliveryFee: isHome ? doorDeliveryFee : null,
        serviceTravelFee,
        dropPoints: dropPoint
          ? [{ dropPointId: dropPoint.id, name: dropPoint.name, fee: 300 }]
          : [],
      });
    }

    return {
      message: 'Test vendor created and approved',
      user: { id: user.id, email: user.email, accountType: user.accountType },
      vendorProfileId: profile.id,
      servedUniversityIds: served,
      delivery,
      password,
      note:
        'Log in via POST /auth/login; catalog writes via /vendors/me/listings; ' +
        'delivery preset via GET/PUT /vendors/me/delivery',
    };
  }

  /**
   * Flip any vendor profile straight to ACTIVE — skips the admin cookie dance.
   */
  @ApiOperation({ summary: 'Approve a vendor profile (any status → ACTIVE)' })
  @ApiParam({ name: 'profileId', description: 'UUID of the vendor profile' })
  @ApiResponse({ status: 201, description: 'Vendor profile activated' })
  @ApiResponse({ status: 403, description: 'Forbidden - only available in development mode' })
  @ApiResponse({ status: 404, description: 'Vendor profile not found' })
  @Post('vendors/:profileId/approve')
  async approveVendor(@Param('profileId') profileId: string) {
    this.checkDevMode();

    const profile = await this.vendorProfileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Vendor profile not found');
    }

    const previousStatus = profile.status;
    profile.status = VendorStatus.ACTIVE;
    profile.reviewedAt = new Date();
    profile.reviewedBy = 'dev-controller';
    profile.rejectionReason = null;
    profile.suspensionReason = null;
    if (!profile.shopfrontPhotoUrl) {
      profile.shopfrontPhotoUrl = 'https://cdn.example.com/dev-shopfront.jpg';
      profile.photoCapturedLive = true;
    }
    await this.vendorProfileRepo.save(profile);

    return {
      message: `Vendor profile moved from ${previousStatus} to active`,
      vendorProfileId: profile.id,
      userId: profile.userId,
      status: profile.status,
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
        {
          method: 'POST',
          path: '/dev/create-test-vendor',
          body: {
            businessName: 'optional',
            email: 'optional',
            phone: 'optional',
            password: 'optional (default DevPass123!)',
            homeUniversityId: 'required',
            servedUniversityIds: 'optional (home always included)',
            shopAddress: 'optional',
            doorDeliveryFee: 'optional naira (default 500; null = none)',
            serviceTravelFee: 'optional naira (default 1000; null = none)',
          },
          description:
            'Create a login-ready, already-ACTIVE vendor-only account (rev-2) with a default ' +
            'delivery preset per served campus (door fee at home, travel fee everywhere, first ' +
            'active admin drop point at ₦300) — edit via GET/PUT /vendors/me/delivery',
        },
        {
          method: 'POST',
          path: '/dev/vendors/:profileId/approve',
          description: 'Flip a vendor profile straight to ACTIVE',
        },
      ],
      tierInfo: {
        none: 'Browse only',
        tier_0: 'Phone + Email verified: Buy ≤₦30k, chat, posts, fund wallet',
        tier_1: 'Documents approved: Sell ≤₦50k, buy ≤₦60k, roommate features',
        tier_2: 'KYC verified: Unlimited access',
        vendor: 'Active vendor-only accounts are TIER_2-equivalent (effectiveTier)',
      },
    };
  }
}
