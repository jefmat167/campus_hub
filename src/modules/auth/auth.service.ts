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
import { Repository, DataSource } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { User, VerificationTier } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { SmsService } from '../sms/sms.service';
import { UniversitiesService } from '../universities/universities.service';
import { EmailService } from '../email/email.service';
import { EmailVerificationType } from '../../database/entities/email-verification.entity';
import { RegisterDto, LoginDto, VerifyPhoneDto } from './dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: Partial<User>;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private walletRepo: Repository<Wallet>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private smsService: SmsService,
    private universitiesService: UniversitiesService,
    private emailService: EmailService,
    private dataSource: DataSource,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Register a new user
   *
   * New flow:
   * 1. Creates user with verificationTier = NONE
   * 2. Sends OTP to phone
   * 3. Sends verification email
   * 4. Returns tokens (user can browse but has limited access)
   */
  async register(dto: RegisterDto): Promise<AuthResponse & { otpSent: boolean; emailSent: boolean; otp?: string }> {
    const formattedPhone = this.formatPhone(dto.phone);
    const email = dto.email.toLowerCase();

    // Check for existing user
    const existingUser = await this.userRepo.findOne({
      where: [{ phone: formattedPhone }, { email }],
    });

    if (existingUser) {
      if (existingUser.phone === formattedPhone) {
        throw new ConflictException('Phone number is already registered');
      }
      throw new ConflictException('Email is already registered');
    }

    // Validate university hierarchy
    await this.universitiesService.validateUniversityHierarchy(
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

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Use transaction for user and wallet creation
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let user: User;

    try {
      // Create user with verificationTier = NONE
      user = this.userRepo.create({
        phone: formattedPhone,
        phoneVerified: false,
        emailVerified: false,
        email,
        passwordHash,
        fullName: dto.fullName,
        universityId: dto.universityId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        yearOfStudy: dto.yearOfStudy,
        bio: dto.bio,
        deviceId: dto.deviceId,
        verificationTier: VerificationTier.NONE,
      });

      await queryRunner.manager.save(user);

      // Create wallet for user
      const wallet = this.walletRepo.create({
        userId: user.id,
      });

      await queryRunner.manager.save(wallet);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Send OTP to phone (outside transaction)
    let otpResult: { message: string; otp?: string } = { message: '' };
    try {
      otpResult = await this.smsService.sendOtp(formattedPhone, 'registration');
    } catch (error) {
      this.logger.error(`Failed to send OTP during registration: ${error}`);
    }

    // Send verification email (outside transaction)
    let emailSent = false;
    try {
      await this.emailService.sendVerificationEmail(
        user.id,
        email,
        EmailVerificationType.PERSONAL,
      );
      emailSent = true;
    } catch (error) {
      this.logger.error(`Failed to send verification email during registration: ${error}`);
    }

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Update user with refresh token hash
    user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    user.lastLoginAt = new Date();
    await this.userRepo.save(user);

    const response: AuthResponse & { otpSent: boolean; emailSent: boolean; otp?: string } = {
      user: this.sanitizeUser(user),
      tokens,
      otpSent: !!otpResult.message,
      emailSent,
    };

    // Include OTP in response only in development mode
    if (otpResult.otp) {
      response.otp = otpResult.otp;
    }

    return response;
  }

  /**
   * Verify phone number with OTP
   * Called after registration to verify phone
   */
  async verifyPhone(userId: string, dto: VerifyPhoneDto): Promise<{
    verified: boolean;
    phoneVerified: boolean;
    emailVerified: boolean;
    verificationTier: VerificationTier;
    message: string;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.phoneVerified) {
      return {
        verified: true,
        phoneVerified: true,
        emailVerified: user.emailVerified,
        verificationTier: user.verificationTier,
        message: 'Phone is already verified',
      };
    }

    // Verify OTP
    const isValid = await this.smsService.verifyOtp(user.phone, dto.otp, 'registration');

    if (!isValid) {
      throw new BadRequestException('Invalid OTP. Please try again.');
    }

    // Update user
    user.phoneVerified = true;
    user.phoneVerifiedAt = new Date();

    // Check if user can be upgraded to Tier 0
    if (user.phoneVerified && user.emailVerified && user.verificationTier === VerificationTier.NONE) {
      user.verificationTier = VerificationTier.TIER_0;
    }

    await this.userRepo.save(user);

    return {
      verified: true,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      verificationTier: user.verificationTier,
      message: user.verificationTier === VerificationTier.TIER_0
        ? 'Phone verified! You are now Tier 0 verified.'
        : 'Phone verified! Please also verify your email to complete Tier 0 verification.',
    };
  }

  /**
   * Resend phone OTP
   */
  async resendPhoneOtp(userId: string): Promise<{ sent: boolean; message: string; otp?: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.phoneVerified) {
      return {
        sent: false,
        message: 'Phone is already verified',
      };
    }

    const result = await this.smsService.sendOtp(user.phone, 'registration');

    return {
      sent: true,
      message: result.message,
      otp: result.otp, // Only in development
    };
  }

  /**
   * Resend email verification
   */
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

  /**
   * Get verification status for current user
   */
  async getVerificationStatus(userId: string): Promise<{
    verificationTier: VerificationTier;
    phoneVerified: boolean;
    emailVerified: boolean;
    canUpgradeToTier0: boolean;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    return {
      verificationTier: user.verificationTier,
      phoneVerified: user.phoneVerified,
      emailVerified: user.emailVerified,
      canUpgradeToTier0: !user.phoneVerified || !user.emailVerified,
    };
  }

  /**
   * Login with email and password
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.userRepo.findOne({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
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

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(userId: string, refreshToken: string): Promise<TokenPair> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
    });

    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Verify refresh token
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

  /**
   * Logout user - invalidates refresh token and blacklists access token
   */
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

  /**
   * Blacklist a token until it expires
   */
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

  /**
   * Check if a token is blacklisted
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    const blacklisted = await this.cacheManager.get(`blacklist:${jti}`);
    return !!blacklisted;
  }

  /**
   * Generate access and refresh tokens
   */
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
   * Format phone number to standard format
   */
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

  /**
   * Remove sensitive fields from user object
   */
  private sanitizeUser(user: User): Partial<User> {
    const { passwordHash, refreshTokenHash, ...sanitized } = user;
    return sanitized;
  }
}
