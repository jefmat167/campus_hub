import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as crypto from 'crypto';

interface TermiiSendOtpResponse {
  pinId: string;
  to: string;
  smsStatus: string;
  status: number;
}

interface TermiiVerifyOtpResponse {
  pinId: string;
  verified: string;
  msisdn: string;
  status: number;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly baseUrl = 'https://api.ng.termii.com/api';
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly isDevelopment: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    this.apiKey = this.configService.get<string>('TERMII_API_KEY', '');
    this.senderId = this.configService.get<string>('TERMII_SENDER_ID', 'CampusHub');
    // Use mock mode in development OR if no API key is provided
    this.isDevelopment =
      this.configService.get<string>('NODE_ENV') === 'development' ||
      !this.apiKey;
  }

  /**
   * Send OTP to phone number
   * In development mode, returns a mock pinId and logs the OTP
   * @param phoneNumber - The phone number to send OTP to
   * @param purpose - The purpose of the OTP (e.g., 'registration', 'withdrawal')
   */
  async sendOtp(
    phoneNumber: string,
    purpose: string = 'verification',
  ): Promise<{ pinId: string; message: string; otp?: string }> {
    // Validate phone number format
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    // Check rate limiting (max 3 OTPs per phone per 10 minutes)
    await this.checkRateLimit(formattedPhone, purpose);

    if (this.isDevelopment) {
      return this.sendMockOtp(formattedPhone, purpose);
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<TermiiSendOtpResponse>(
          `${this.baseUrl}/sms/otp/send`,
          {
            api_key: this.apiKey,
            message_type: 'NUMERIC',
            to: formattedPhone,
            from: this.senderId,
            channel: 'generic',
            pin_attempts: 3,
            pin_time_to_live: 10, // 10 minutes
            pin_length: 6,
            pin_placeholder: '< 1234 >',
            message_text: 'Your CampusHub verification code is < 1234 >. Valid for 10 minutes.',
            pin_type: 'NUMERIC',
          },
        ),
      );

      if (response.data.status !== 200) {
        throw new BadRequestException('Failed to send OTP. Please try again.');
      }

      // Store pinId in cache for verification
      await this.cacheManager.set(
        `otp:${purpose}:pin:${formattedPhone}`,
        response.data.pinId,
        600000, // 10 minutes in ms
      );

      // Increment rate limit counter
      await this.incrementRateLimit(formattedPhone, purpose);

      return {
        pinId: response.data.pinId,
        message: 'OTP sent successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to send OTP: ${error.message}`, error.stack);
      throw new BadRequestException('Failed to send OTP. Please try again later.');
    }
  }

  /**
   * Verify OTP code
   * @param phoneNumber - The phone number the OTP was sent to
   * @param otp - The OTP code to verify
   * @param purpose - The purpose of the OTP (must match what was used in sendOtp)
   */
  async verifyOtp(
    phoneNumber: string,
    otp: string,
    purpose: string = 'verification',
  ): Promise<boolean> {
    const formattedPhone = this.formatPhoneNumber(phoneNumber);

    if (this.isDevelopment) {
      return this.verifyMockOtp(formattedPhone, otp, purpose);
    }

    // Get stored pinId
    const pinId = await this.cacheManager.get<string>(`otp:${purpose}:pin:${formattedPhone}`);

    if (!pinId) {
      throw new BadRequestException('OTP expired or not found. Please request a new one.');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<TermiiVerifyOtpResponse>(
          `${this.baseUrl}/sms/otp/verify`,
          {
            api_key: this.apiKey,
            pin_id: pinId,
            pin: otp,
          },
        ),
      );

      if (response.data.verified === 'True') {
        // Clear the OTP from cache
        await this.cacheManager.del(`otp:${purpose}:pin:${formattedPhone}`);
        await this.cacheManager.del(`otp:${purpose}:mock:${formattedPhone}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to verify OTP: ${error.message}`, error.stack);

      // Check if it's an invalid OTP error from Termii
      if (error.response?.data?.verified === 'False') {
        return false;
      }

      throw new BadRequestException('Failed to verify OTP. Please try again.');
    }
  }

  /**
   * Send mock OTP for development/testing
   */
  private async sendMockOtp(
    phoneNumber: string,
    purpose: string = 'verification',
  ): Promise<{ pinId: string; message: string; otp: string }> {
    // Generate a mock 6-digit OTP
    const mockOtp = crypto.randomInt(100000, 999999).toString();
    const mockPinId = `mock_${crypto.randomUUID()}`;

    // Store in cache with purpose-specific keys
    await this.cacheManager.set(
      `otp:${purpose}:mock:${phoneNumber}`,
      mockOtp,
      600000, // 10 minutes
    );
    await this.cacheManager.set(
      `otp:${purpose}:pin:${phoneNumber}`,
      mockPinId,
      600000,
    );

    // Log the OTP for development
    this.logger.warn(`[DEV MODE] OTP for ${phoneNumber} (${purpose}): ${mockOtp}`);
    console.log(`\n========================================`);
    console.log(`  DEVELOPMENT MODE - OTP`);
    console.log(`  Phone: ${phoneNumber}`);
    console.log(`  Purpose: ${purpose}`);
    console.log(`  OTP: ${mockOtp}`);
    console.log(`========================================\n`);

    await this.incrementRateLimit(phoneNumber, purpose);

    return {
      pinId: mockPinId,
      message: 'OTP sent successfully (dev mode)',
      otp: mockOtp,
    };
  }

  /**
   * Verify mock OTP for development/testing
   */
  private async verifyMockOtp(
    phoneNumber: string,
    otp: string,
    purpose: string = 'verification',
  ): Promise<boolean> {
    const storedOtp = await this.cacheManager.get<string>(`otp:${purpose}:mock:${phoneNumber}`);

    if (!storedOtp) {
      throw new BadRequestException('OTP expired or not found. Please request a new one.');
    }

    if (storedOtp === otp) {
      // Clear the OTP from cache
      await this.cacheManager.del(`otp:${purpose}:mock:${phoneNumber}`);
      await this.cacheManager.del(`otp:${purpose}:pin:${phoneNumber}`);
      return true;
    }

    return false;
  }

  /**
   * Format phone number to Nigerian format
   */
  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    let cleaned = phone.replace(/\D/g, '');

    // Handle different formats
    if (cleaned.startsWith('234')) {
      // Already in international format
      return cleaned;
    } else if (cleaned.startsWith('0')) {
      // Local format: 0801234567 -> 234801234567
      return '234' + cleaned.substring(1);
    } else if (cleaned.startsWith('8') || cleaned.startsWith('9') || cleaned.startsWith('7')) {
      // Missing prefix: 801234567 -> 234801234567
      return '234' + cleaned;
    }

    // Return as-is if format is unknown
    return cleaned;
  }

  /**
   * Check rate limiting for OTP requests
   */
  private async checkRateLimit(
    phoneNumber: string,
    purpose: string = 'verification',
  ): Promise<void> {
    const key = `otp:${purpose}:ratelimit:${phoneNumber}`;
    const count = await this.cacheManager.get<number>(key) || 0;

    if (count >= 3) {
      throw new BadRequestException(
        'Too many OTP requests. Please wait 10 minutes before trying again.',
      );
    }
  }

  /**
   * Increment rate limit counter
   */
  private async incrementRateLimit(
    phoneNumber: string,
    purpose: string = 'verification',
  ): Promise<void> {
    const key = `otp:${purpose}:ratelimit:${phoneNumber}`;
    const count = (await this.cacheManager.get<number>(key)) || 0;
    await this.cacheManager.set(key, count + 1, 600000); // 10 minutes
  }
}
