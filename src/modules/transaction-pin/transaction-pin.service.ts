import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../database/entities/user.entity';
import { SmsService } from '../sms/sms.service';

/** 6-digit numeric PIN. */
const PIN_REGEX = /^\d{6}$/;

/**
 * Transaction PIN: a user-set 6-digit credential required for every money-out
 * action (escrow purchases, buy-request acceptance, withdrawals). Stored as a
 * bcrypt hash on the user; brute force is bounded by a 5-attempt / 15-minute
 * lockout (a 6-digit PIN is only 1M combinations, so the lockout is essential).
 *
 * Management: set (password-confirmed), change (current-PIN), reset (SMS OTP on
 * a distinct `pin_reset` purpose so a withdrawal OTP can't double as a reset).
 */
@Injectable()
export class TransactionPinService {
  private readonly logger = new Logger(TransactionPinService.name);

  private static readonly SALT_ROUNDS = 12;
  private static readonly MAX_ATTEMPTS = 5;
  private static readonly LOCK_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly OTP_PURPOSE = 'pin_reset';

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly smsService: SmsService,
  ) {}

  async getStatus(
    userId: string,
  ): Promise<{ hasPin: boolean; locked: boolean }> {
    const user = await this.loadPinState(userId);
    return { hasPin: !!user.pinHash, locked: this.isLocked(user) };
  }

  /** First-time set — requires account password confirmation. */
  async setPin(userId: string, password: string, newPin: string): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'passwordHash', 'pinHash'],
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.pinHash) {
      throw new ConflictException(
        'A transaction PIN is already set. Use change-PIN or reset instead.',
      );
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Incorrect password');
    }
    await this.writePin(userId, newPin);
    this.logger.log(`Transaction PIN set for user ${userId}`);
  }

  /** Change an existing PIN — requires the current PIN (subject to lockout). */
  async changePin(
    userId: string,
    currentPin: string,
    newPin: string,
  ): Promise<void> {
    // Enforces "PIN is set", lockout, and correctness (throws otherwise).
    await this.verifyForTransaction(userId, currentPin);
    await this.writePin(userId, newPin);
    this.logger.log(`Transaction PIN changed for user ${userId}`);
  }

  /** Send an SMS OTP (distinct `pin_reset` purpose) to start a reset. */
  async requestReset(userId: string): Promise<{ message: string; otp?: string }> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'phone'],
    });
    if (!user) throw new NotFoundException('User not found');
    const res = await this.smsService.sendOtp(
      user.phone,
      TransactionPinService.OTP_PURPOSE,
    );
    return { message: 'A reset code has been sent to your phone.', otp: res.otp };
  }

  /** Complete a reset with the OTP; also clears any lockout. */
  async resetPin(userId: string, otp: string, newPin: string): Promise<void> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'phone'],
    });
    if (!user) throw new NotFoundException('User not found');
    const valid = await this.smsService.verifyOtp(
      user.phone,
      otp,
      TransactionPinService.OTP_PURPOSE,
    );
    if (!valid) throw new BadRequestException('Invalid or expired reset code');
    await this.writePin(userId, newPin);
    this.logger.log(`Transaction PIN reset for user ${userId}`);
  }

  /**
   * Verify a PIN for a money-out action, enforcing lockout. Throws on any
   * failure (no PIN set / locked / missing / malformed / incorrect) so callers
   * can treat a normal return as success. A malformed PIN is a 400 and does NOT
   * burn an attempt; only a well-formed but wrong PIN counts toward the lockout.
   */
  async verifyForTransaction(
    userId: string,
    pin: string | undefined,
  ): Promise<void> {
    const user = await this.loadPinState(userId);

    if (!user.pinHash) {
      throw new ForbiddenException({
        message: 'Set a transaction PIN before making this transaction.',
        code: 'PIN_NOT_SET',
      });
    }
    if (this.isLocked(user)) {
      throw new ForbiddenException({
        message:
          'Your transaction PIN is temporarily locked after too many incorrect attempts. Try again later or reset it.',
        code: 'PIN_LOCKED',
        lockedUntil: user.pinLockedUntil,
      });
    }
    if (!pin) {
      throw new BadRequestException({
        message: 'Transaction PIN is required.',
        code: 'PIN_REQUIRED',
      });
    }
    if (!PIN_REGEX.test(pin)) {
      throw new BadRequestException({
        message: 'Transaction PIN must be exactly 6 digits.',
        code: 'PIN_INVALID_FORMAT',
      });
    }

    if (await bcrypt.compare(pin, user.pinHash)) {
      // Success: clear any prior failed attempts / stale lock.
      if ((user.pinAttempts ?? 0) !== 0 || user.pinLockedUntil) {
        await this.userRepo.update(
          { id: userId },
          { pinAttempts: 0, pinLockedUntil: null },
        );
      }
      return;
    }

    // Wrong PIN → count the attempt, lock after MAX_ATTEMPTS.
    const attempts = (user.pinAttempts ?? 0) + 1;
    if (attempts >= TransactionPinService.MAX_ATTEMPTS) {
      await this.userRepo.update(
        { id: userId },
        {
          pinAttempts: 0, // reset so a fresh window opens once the lock expires
          pinLockedUntil: new Date(Date.now() + TransactionPinService.LOCK_MS),
        },
      );
      throw new ForbiddenException({
        message:
          'Too many incorrect PIN attempts. Your transaction PIN is locked for 15 minutes.',
        code: 'PIN_LOCKED',
      });
    }
    await this.userRepo.update({ id: userId }, { pinAttempts: attempts });
    throw new ForbiddenException({
      message: `Incorrect transaction PIN. ${
        TransactionPinService.MAX_ATTEMPTS - attempts
      } attempt(s) remaining.`,
      code: 'PIN_INVALID',
    });
  }

  private async writePin(userId: string, newPin: string): Promise<void> {
    if (!PIN_REGEX.test(newPin)) {
      throw new BadRequestException('Transaction PIN must be exactly 6 digits.');
    }
    await this.userRepo.update(
      { id: userId },
      {
        pinHash: await bcrypt.hash(newPin, TransactionPinService.SALT_ROUNDS),
        pinAttempts: 0,
        pinLockedUntil: null,
      },
    );
  }

  private async loadPinState(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      select: ['id', 'pinHash', 'pinAttempts', 'pinLockedUntil'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private isLocked(user: User): boolean {
    return !!user.pinLockedUntil && user.pinLockedUntil.getTime() > Date.now();
  }
}
