import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { User, VerificationTier } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { PasswordReset } from '../../database/entities/password-reset.entity';
import { UniversitiesService } from '../universities/universities.service';
import { EmailService } from '../email/email.service';
import { UsersService } from '../users/users.service';
import { EmailVerificationType } from '../../database/entities/email-verification.entity';
import {
  AUTH_QUEUE_NAME,
  AuthJobName,
} from './interfaces/auth-jobs.interface';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: Partial<User>;
  tokens: TokenPair;
  deletionCancelled?: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    @InjectRepository(PasswordReset)
    private passwordResetRepo: Repository<PasswordReset>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private universitiesService: UniversitiesService,
    private emailService: EmailService,
    private usersService: UsersService,
    private dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue(AUTH_QUEUE_NAME) private authQueue: Queue,
  ) { }

  /**
   * Register a new user (Optimized)
   *
   * Optimizations applied:
   * 1. Parallelize bcrypt operations (password + refresh token hash)
   * 2. Single user save with refresh token hash in transaction
   * 3. No post-transaction reload - construct response from cached entity data
   * 4. SMS and email moved to background queue (except dev mode SMS for mock OTP)
   *
   * Flow:
   * 1. Creates user with verificationTier = NONE
   * 2. Queues verification email
   * 3. Returns tokens (user can browse but has limited access)
   */
  async register(dto: RegisterDto): Promise<AuthResponse & { emailSent: boolean }> {
    const formattedPhone = this.formatPhone(dto.phone);
    const email = dto.email.toLowerCase();

    // Check for existing user (exclude soft-deleted users to allow re-registration)
    const existingUser = await this.userRepo.findOne({
      where: [
        { phone: formattedPhone, isDeleted: false },
        { email, isDeleted: false },
      ],
    });

    if (existingUser) {
      if (existingUser.phone === formattedPhone) {
        throw new ConflictException('Phone number is already registered');
      }
      throw new ConflictException('Email is already registered');
    }

    // Validate university hierarchy AND get entity data for response
    const { university, faculty, department } =
      await this.universitiesService.validateAndGetHierarchy(
        dto.universityId,
        dto.facultyId,
        dto.departmentId,
      );

    // Check for banned device
    if (dto.deviceId) {
      const bannedDevice = await this.userRepo.findOne({
        where: { deviceId: dto.deviceId, isBanned: true },
      });

      if (bannedDevice) {
        throw new BadRequestException('This device has been banned from the platform');
      }
    }

    // OPTIMIZATION: Parallelize password hash and refresh token hash
    const refreshTokenJti = uuidv4();
    const [passwordHash, refreshTokenHash] = await Promise.all([
      bcrypt.hash(dto.password, 12),
      bcrypt.hash(refreshTokenJti, 10),
    ]);

    // Use transaction for user and wallet creation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let user: User;

    try {
      // OPTIMIZATION: Create user WITH refresh token hash (single save)
      user = this.userRepo.create({
        phone: formattedPhone,
        phoneVerified: false,
        emailVerified: false,
        email,
        passwordHash,
        fullName: dto.fullName,
        gender: dto.gender,
        universityId: dto.universityId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        yearOfStudy: dto.yearOfStudy,
        bio: dto.bio,
        deviceId: dto.deviceId,
        verificationTier: VerificationTier.NONE,
        refreshTokenHash,
        lastLoginAt: new Date(),
      });

      await queryRunner.manager.save(user);

      // Create wallet for user
      // In development, seed wallet with ₦1,000,000 for testing
      const isDev = this.configService.get<string>('NODE_ENV') === 'development';
      const wallet = this.walletRepo.create({
        userId: user.id,
        balance: isDev ? 1000000 : 0,
      });

      await queryRunner.manager.save(wallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Generate tokens using the pre-hashed refresh token JTI
    const tokens = await this.generateTokensWithJti(user, refreshTokenJti);

    // Queue verification email job (non-blocking)
    let emailQueued = false;
    try {
      await this.authQueue.add(
        AuthJobName.SEND_VERIFICATION_EMAIL,
        { userId: user.id, email, type: EmailVerificationType.PERSONAL },
        { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      );
      emailQueued = true;
    } catch (error) {
      this.logger.error(`Failed to queue email job: ${error}`);
    }

    // OPTIMIZATION: Build response without DB reload using cached entity data
    return {
      user: this.sanitizeUserWithRelations(user, university, faculty, department),
      tokens,
      emailSent: emailQueued,
    };
  }

  async resendEmailVerification(userId: string): Promise<{
    sent: boolean;
    message: string;
    remainingAttempts?: number;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.emailVerified) {
      return {
        sent: false,
        message: 'Email is already verified',
      };
    }

    const result = await this.emailService.resendVerificationEmail(
      userId,
      EmailVerificationType.PERSONAL,
    );

    return {
      sent: result.sent,
      message: result.message,
      remainingAttempts: result.remainingAttempts,
    };
  }

  async getVerificationStatus(userId: string): Promise<{
    verificationTier: VerificationTier;
    emailVerified: boolean;
    canUpgradeToTier0: boolean;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      verificationTier: user.verificationTier,
      emailVerified: user.emailVerified,
      canUpgradeToTier0: !user.emailVerified && user.verificationTier === VerificationTier.NONE,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
      relations: ['university', 'faculty', 'department'],
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if user account is deleted
    if (user.isDeleted) {
      throw new UnauthorizedException('This account has been deleted');
    }

    // Check if user is banned
    if (user.isBanned && (!user.banExpiresAt || user.banExpiresAt > new Date())) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if user has scheduled deletion - auto-cancel it
    let deletionCancelled = false;
    if (user.isDeactivated) {
      const cancelResult = await this.usersService.cancelAccountDeletion(user.id);
      deletionCancelled = cancelResult.success;
      this.logger.log(`Account deletion cancelled for user ${user.id} on login`);
    }

    // Update device ID if provided
    if (dto.deviceId) {
      user.deviceId = dto.deviceId;
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Update user
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const response: AuthResponse = {
      user: this.sanitizeUser(user),
      tokens,
    };

    if (deletionCancelled) {
      response.deletionCancelled = true;
    }

    return response;
  }

  async refreshTokens(userId: string, refreshToken: string): Promise<TokenPair> {
    // Verify refresh token JWT (checks signature + expiration)
    try {
      this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Refresh token expired or invalid');
    }

    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Verify refresh token matches stored hash
    const isRefreshTokenValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);

    if (!isRefreshTokenValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Generate new tokens
    const tokens = await this.generateTokens(user);

    // Update refresh token hash
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.userRepo.save(user);

    return tokens;
  }

  async logout(userId: string, accessToken?: string): Promise<{ message: string }> {
    // Invalidate refresh token
    await this.userRepo.update(userId, {
      refreshTokenHash: undefined,
    });

    // Blacklist access token if provided
    if (accessToken) {
      await this.blacklistToken(accessToken);
    }

    return { message: 'Logged out successfully' };
  }

  async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(token) as { jti?: string; exp?: number };

      if (decoded?.jti && decoded?.exp) {
        const now = Math.floor(Date.now() / 1000);
        const ttl = (decoded.exp - now) * 1000; // Convert to milliseconds

        if (ttl > 0) {
          await this.cacheManager.set(`blacklist:${decoded.jti}`, '1', ttl);
        }
      }
    } catch {
      // If token can't be decoded, skip blacklisting
    }
  }

  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const blacklisted = await this.cacheManager.get(`blacklist:${jti}`);
    return !!blacklisted;
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase();

    const user = await this.userRepo.findOne({ where: { email } });

    // Always return same message to prevent email enumeration
    const successMessage =
      'If an account exists with this email, you will receive a password reset link shortly.';

    if (!user) {
      this.logger.log(`Password reset requested for non-existent email: ${email}`);
      return { message: successMessage };
    }

    // Invalidate any existing unused reset tokens for this user
    await this.passwordResetRepo.update(
      { userId: user.id, usedAt: IsNull() },
      { usedAt: new Date() },
    );

    // Create new password reset record
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    const passwordReset = this.passwordResetRepo.create({
      userId: user.id,
      email: user.email,
      token: uuidv4(),
      expiresAt,
    });

    await this.passwordResetRepo.save(passwordReset);

    // Send reset email
    try {
      await this.emailService.sendPasswordResetEmail(
        user.email,
        passwordReset.token,
        user.fullName,
      );
    } catch (error) {
      this.logger.error(`Failed to send password reset email: ${error}`);
      // Still return success message to not reveal email existence
    }

    return { message: successMessage };
  }

  /**
   * Validate a password reset token without using it
   * Used to check if token is valid before showing the reset form
   */
  async validateResetToken(token: string): Promise<{ valid: boolean; error?: string }> {
    const passwordReset = await this.passwordResetRepo.findOne({
      where: { token },
    });

    if (!passwordReset) {
      return { valid: false, error: 'Invalid or expired reset token' };
    }

    if (passwordReset.isUsed) {
      return { valid: false, error: 'This reset link has already been used' };
    }

    if (passwordReset.isExpired) {
      return { valid: false, error: 'This reset link has expired. Please request a new one.' };
    }

    return { valid: true };
  }

  /**
   * Reset password using token (for form submission)
   */
  async resetPassword(token: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    const passwordReset = await this.passwordResetRepo.findOne({
      where: { token },
      relations: ['user'],
    });

    if (!passwordReset) {
      return { success: false, error: 'Invalid or expired reset token' };
    }

    if (passwordReset.isUsed) {
      return { success: false, error: 'This reset link has already been used' };
    }

    if (passwordReset.isExpired) {
      return { success: false, error: 'This reset link has expired. Please request a new one.' };
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update user's password and invalidate all sessions
    await this.userRepo.update(passwordReset.userId, {
      passwordHash,
      refreshTokenHash: undefined,
    });

    // Mark token as used
    passwordReset.usedAt = new Date();
    await this.passwordResetRepo.save(passwordReset);

    this.logger.log(`Password reset successful for user: ${passwordReset.userId}`);

    return { success: true };
  }

  private async generateTokens(user: User): Promise<TokenPair> {
    const basePayload = {
      sub: user.id,
      email: user.email,
      universityId: user.universityId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, jti: uuidv4() },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m') as string,
        } as any,
      ),
      this.jwtService.signAsync(
        { ...basePayload, jti: uuidv4() },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as string,
        } as any,
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }

  /**
   * Generate tokens using a pre-determined JTI for the refresh token.
   * This allows us to hash the refresh token value before user creation
   * for parallel bcrypt operations.
   */
  private async generateTokensWithJti(user: User, refreshTokenJti: string): Promise<TokenPair> {
    const basePayload = {
      sub: user.id,
      email: user.email,
      universityId: user.universityId,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, jti: uuidv4() },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m') as string,
        } as any,
      ),
      this.jwtService.signAsync(
        { ...basePayload, jti: refreshTokenJti },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as string,
        } as any,
      ),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  private formatPhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('234')) {
      return cleaned;
    } else if (cleaned.startsWith('0')) {
      return '234' + cleaned.substring(1);
    } else if (cleaned.startsWith('8') || cleaned.startsWith('9') || cleaned.startsWith('7')) {
      return '234' + cleaned;
    }

    return cleaned;
  }

  private sanitizeUser(user: User): Record<string, any> {
    const { passwordHash, refreshTokenHash, university, faculty, department, ...sanitized } = user;

    return {
      ...sanitized,
      university: university ? { id: university.id, name: university.name, code: university.code } : undefined,
      faculty: faculty ? { id: faculty.id, name: faculty.name, code: faculty.code } : undefined,
      department: department ? { id: department.id, name: department.name, code: department.code } : undefined,
    };
  }

  /**
   * Sanitize user with manually attached relation data.
   * This avoids needing to reload user with JOINs after creation.
   */
  private sanitizeUserWithRelations(
    user: User,
    university: { id: string; name: string; code: string },
    faculty: { id: string; name: string; code: string },
    department: { id: string; name: string; code: string },
  ): Record<string, any> {
    const { passwordHash, refreshTokenHash, ...sanitized } = user;

    return {
      ...sanitized,
      university: { id: university.id, name: university.name, code: university.code },
      faculty: { id: faculty.id, name: faculty.name, code: faculty.code },
      department: { id: department.id, name: department.name, code: department.code },
    };
  }
}
