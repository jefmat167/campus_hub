import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { Listing, ListingStatus } from '../../database/entities/listing.entity';
import { HousingListing, HousingStatus } from '../../database/entities/housing.entity';
import { EscrowTransaction, EscrowStatus } from '../../database/entities/escrow.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { RoommateProfile, RoommateProfileStatus } from '../../database/entities/roommate.entity';
import { SmsService } from '../sms/sms.service';
import { EmailService } from '../email/email.service';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  USERS_QUEUE_NAME,
  UsersJobName,
} from './interfaces/users-jobs.interface';

// Grace period for account deletion (30 days)
const GRACE_PERIOD_DAYS = 30;
// Reminder email sent 3 days before deletion (27 days after scheduling)
const REMINDER_DAYS_BEFORE = 3;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Listing)
    private listingRepo: Repository<Listing>,
    @InjectRepository(HousingListing)
    private housingRepo: Repository<HousingListing>,
    @InjectRepository(EscrowTransaction)
    private escrowRepo: Repository<EscrowTransaction>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(RoommateProfile)
    private roommateProfileRepo: Repository<RoommateProfile>,
    private smsService: SmsService,
    private emailService: EmailService,
    private dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue(USERS_QUEUE_NAME) private usersQueue: Queue,
  ) { }

  /**
   * Get user by ID
   */
  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: ['university', 'faculty', 'department'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Get user profile (sanitized, same format as auth/register response)
   */
  async getProfile(userId: string): Promise<Record<string, any>> {
    const user = await this.findById(userId);

    // Exclude sensitive fields and format relations (same as auth register response)
    const { passwordHash, refreshTokenHash, university, faculty, department, ...sanitized } = user;

    return {
      ...sanitized,
      university: university ? { id: university.id, name: university.name, code: university.code } : undefined,
      faculty: faculty ? { id: faculty.id, name: faculty.name, code: faculty.code } : undefined,
      department: department ? { id: department.id, name: department.name, code: department.code } : undefined,
    };
  }

  /**
   * Get public profile of another user
   */
  async getPublicProfile(
    userId: string,
    viewerId: string,
  ): Promise<Partial<User> & { isVerifiedSeller: boolean }> {
    const [user, viewer] = await Promise.all([
      this.findById(userId),
      this.findById(viewerId),
    ]);

    // Only allow viewing profiles within same university
    if (user.universityId !== viewer.universityId) {
      throw new NotFoundException('User not found');
    }

    return {
      id: user.id,
      fullName: user.fullName,
      profilePhotoUrl: user.profilePhotoUrl,
      bio: user.bio,
      yearOfStudy: user.yearOfStudy,
      faculty: user.faculty,
      department: user.department,
      verificationTier: user.verificationTier,
      sellerRating: user.sellerRating,
      sellerRatingCount: user.sellerRatingCount,
      completedTransactions: user.completedTransactions,
      isVerifiedSeller: user.isVerifiedSeller,
      createdAt: user.createdAt,
    };
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, dto: UpdateUserDto): Promise<Record<string, any>> {
    const user = await this.findById(userId);

    // Update only provided fields
    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
    }
    if (dto.bio !== undefined) {
      user.bio = dto.bio;
    }
    if (dto.yearOfStudy !== undefined) {
      user.yearOfStudy = dto.yearOfStudy;
    }
    if (dto.profilePhotoUrl !== undefined) {
      user.profilePhotoUrl = dto.profilePhotoUrl;
    }

    await this.userRepo.save(user);

    // Return sanitized profile
    return this.getProfile(userId);
  }

  /**
   * Update last active timestamp
   */
  async updateLastActive(userId: string): Promise<void> {
    await this.userRepo.update(userId, {
      lastActiveAt: new Date(),
    });
  }

  /**
   * Check if user can transact
   */
  async canTransact(userId: string): Promise<{ canTransact: boolean; reason?: string; }> {
    const user = await this.findById(userId);

    if (user.isBanned) {
      if (!user.banExpiresAt || user.banExpiresAt > new Date()) {
        return {
          canTransact: false,
          reason: 'Your account has been suspended',
        };
      }
    }

    if (user.verificationTier === VerificationTier.NONE) {
      return {
        canTransact: false,
        reason: 'Please complete verification (phone + email) to transact',
      };
    }

    return { canTransact: true };
  }

  /**
   * Check if user can delete their account
   * Blocks deletion if user has active escrow transactions
   */
  async checkCanDeleteAccount(userId: string): Promise<{
    canDelete: boolean;
    reason?: string;
    activeEscrowCount?: number;
  }> {
    const activeStatuses = [
      EscrowStatus.AWAITING_SELLER,
      EscrowStatus.SELLER_READY,
      EscrowStatus.DELIVERED,
      EscrowStatus.DISPUTED,
    ];

    const activeEscrowCount = await this.escrowRepo.count({
      where: [
        { buyerId: userId, status: In(activeStatuses) },
        { sellerId: userId, status: In(activeStatuses) },
      ],
    });

    if (activeEscrowCount > 0) {
      return {
        canDelete: false,
        reason: `You have ${activeEscrowCount} active escrow transaction(s). Please complete or cancel them before deleting your account.`,
        activeEscrowCount,
      };
    }

    return { canDelete: true };
  }

  /**
   * Request OTP for account deletion
   */
  async requestAccountDeletionOtp(userId: string): Promise<{
    sent: boolean;
    message: string;
    otp?: string;
  }> {
    const user = await this.findById(userId);

    const result = await this.smsService.sendOtp(user.phone, 'account_deletion');

    return {
      sent: true,
      message: 'OTP sent to your phone',
      otp: result.otp, // Only returned in development mode
    };
  }

  /**
   * Schedule user account for deletion (30-day grace period)
   * - Verifies OTP
   * - Checks for active escrows
   * - Soft deletes marketplace, housing listings, and roommate profile
   * - Forfeits wallet balance
   * - Marks user as deactivated with scheduled deletion date
   * - Queues deletion jobs (reminder + final deletion)
   * - Sends confirmation email
   * - Blacklists current access token
   */
  async deleteAccount(
    userId: string,
    otp: string,
    accessToken?: string,
  ): Promise<{
    success: boolean;
    message: string;
    scheduledDeletionAt: Date;
    gracePeriodDays: number;
  }> {
    const user = await this.findById(userId);

    // Verify OTP
    const isValidOtp = await this.smsService.verifyOtp(
      user.phone,
      otp,
      'account_deletion',
    );

    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Check for active escrows
    const canDelete = await this.checkCanDeleteAccount(userId);
    if (!canDelete.canDelete) {
      throw new BadRequestException(canDelete.reason);
    }

    // Calculate scheduled deletion date
    const scheduledDeletionAt = new Date();
    scheduledDeletionAt.setDate(scheduledDeletionAt.getDate() + GRACE_PERIOD_DAYS);

    // Use transaction for atomic operations
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Soft delete marketplace listings
      await queryRunner.manager.update(
        Listing,
        { sellerId: userId, status: In([ListingStatus.ACTIVE, ListingStatus.PAUSED]) },
        { status: ListingStatus.DELETED },
      );

      // 2. Soft delete housing listings
      await queryRunner.manager.update(
        HousingListing,
        { posterId: userId, status: In([HousingStatus.AVAILABLE, HousingStatus.PAUSED]) },
        { status: HousingStatus.DELETED },
      );

      // 3. Soft delete roommate profile
      await queryRunner.manager.update(
        RoommateProfile,
        { userId, status: In([RoommateProfileStatus.ACTIVE, RoommateProfileStatus.PAUSED]) },
        { status: RoommateProfileStatus.DELETED },
      );

      // 4. Forfeit wallet balance
      await queryRunner.manager.update(
        Wallet,
        { userId },
        { balance: 0, lockedBalance: 0 },
      );

      // 5. Mark user as deactivated and schedule deletion
      await queryRunner.manager.update(
        User,
        { id: userId },
        {
          isDeactivated: true,
          scheduledDeletionAt,
          refreshTokenHash: undefined,
        },
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Queue background jobs
    const reminderDelayMs = (GRACE_PERIOD_DAYS - REMINDER_DAYS_BEFORE) * 24 * 60 * 60 * 1000;
    const deletionDelayMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;

    try {
      // Queue reminder email (27 days from now)
      await this.usersQueue.add(
        UsersJobName.SEND_DELETION_REMINDER,
        {
          userId,
          email: user.email,
          fullName: user.fullName,
          scheduledDeletionAt,
        },
        {
          delay: reminderDelayMs,
          jobId: `deletion-reminder-${userId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );

      // Queue final deletion (30 days from now)
      await this.usersQueue.add(
        UsersJobName.PROCESS_SCHEDULED_DELETION,
        { userId },
        {
          delay: deletionDelayMs,
          jobId: `deletion-process-${userId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      );

      this.logger.log(`Scheduled deletion jobs for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to queue deletion jobs: ${error}`);
    }

    // Send confirmation email
    try {
      await this.emailService.sendAccountDeletionScheduledEmail(
        user.email,
        user.fullName,
        scheduledDeletionAt,
      );
    } catch (error) {
      this.logger.error(`Failed to send deletion confirmation email: ${error}`);
    }

    // Blacklist access token if provided
    if (accessToken) {
      await this.blacklistToken(accessToken);
    }

    return {
      success: true,
      message: 'Your account has been scheduled for deletion',
      scheduledDeletionAt,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    };
  }

  /**
   * Cancel account deletion (called when user logs in during grace period)
   * - Reactivates account
   * - Restores listings where appropriate
   * - Removes scheduled deletion jobs
   */
  async cancelAccountDeletion(userId: string): Promise<{
    success: boolean;
    message: string;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user || !user.isDeactivated) {
      return { success: false, message: 'No pending deletion to cancel' };
    }

    // Use transaction for atomic operations
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Reactivate user account
      await queryRunner.manager.update(
        User,
        { id: userId },
        {
          isDeactivated: false,
          scheduledDeletionAt: null,
        },
      );

      // 2. Reactivate marketplace listings (DELETED -> PAUSED for safety)
      await queryRunner.manager.update(
        Listing,
        { sellerId: userId, status: ListingStatus.DELETED },
        { status: ListingStatus.PAUSED },
      );

      // 3. Reactivate housing listings (DELETED -> PAUSED for safety)
      await queryRunner.manager.update(
        HousingListing,
        { posterId: userId, status: HousingStatus.DELETED },
        { status: HousingStatus.PAUSED },
      );

      // 4. Reactivate roommate profile (DELETED -> PAUSED for safety)
      await queryRunner.manager.update(
        RoommateProfile,
        { userId, status: RoommateProfileStatus.DELETED },
        { status: RoommateProfileStatus.PAUSED },
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Remove scheduled jobs from queue
    try {
      const reminderJob = await this.usersQueue.getJob(`deletion-reminder-${userId}`);
      if (reminderJob) {
        await reminderJob.remove();
      }

      const deletionJob = await this.usersQueue.getJob(`deletion-process-${userId}`);
      if (deletionJob) {
        await deletionJob.remove();
      }

      this.logger.log(`Cancelled deletion jobs for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to remove deletion jobs: ${error}`);
    }

    this.logger.log(`Account deletion cancelled for user ${userId}`);

    return {
      success: true,
      message: 'Your account deletion has been cancelled. Your listings have been paused.',
    };
  }

  /**
   * Blacklist an access token
   */
  private async blacklistToken(token: string): Promise<void> {
    try {
      // Decode token to get jti and exp
      const parts = token.split('.');
      if (parts.length !== 3) return;

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      if (payload?.jti && payload?.exp) {
        const now = Math.floor(Date.now() / 1000);
        const ttl = (payload.exp - now) * 1000; // Convert to milliseconds

        if (ttl > 0) {
          await this.cacheManager.set(`blacklist:${payload.jti}`, '1', ttl);
        }
      }
    } catch {
      // If token can't be decoded, skip blacklisting
    }
  }
}
