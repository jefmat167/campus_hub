import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  VerifyPhoneDto,
  ForgotPasswordDto,
} from './dto';
import { LoginPlatform } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmailService } from '../email/email.service';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) { }

  /**
   * Register a new user
   *
   * New simplified flow:
   * 1. User submits registration data
   * 2. Account created with verificationTier = NONE
   * 3. OTP sent to phone, verification email sent
   * 4. User verifies phone via POST /auth/verify-phone
   * 5. User verifies email by clicking link
   * 6. When both verified → verificationTier = TIER_0
   */
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ medium: { limit: 5, ttl: 3600000 } }) // 5 per hour per IP
  @ApiOperation({
    summary: 'Register a new user',
    description: `
      Creates a new user account with verificationTier = NONE.
      Sends OTP to phone and verification email automatically.
      User can browse but has limited access until verified.

      After registration:
      - Verify phone: POST /auth/verify-phone
      - Email verified by clicking link
      - When both verified → Tier 0 (can buy ≤₦30k, chat, post)
    `,
  })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    schema: {
      example: {
        user: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'john.doe@gmail.com',
          fullName: 'John Doe',
          phone: '2348012345678',
          verificationTier: 'none',
          phoneVerified: false,
          emailVerified: false,
        },
        tokens: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          expiresIn: 900,
        },
        otpSent: true,
        emailSent: true,
        otp: '123456 (development only)',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email or phone already registered' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts from this IP' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('verify-phone')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // 5 per minute
  @ApiOperation({
    summary: 'Verify phone number with OTP',
    description: 'Verifies the phone number using the OTP sent during registration. When both phone and email are verified, user is upgraded to Tier 0.',
  })
  @ApiResponse({
    status: 200,
    description: 'Phone verification result',
    schema: {
      example: {
        verified: true,
        phoneVerified: true,
        emailVerified: false,
        verificationTier: 'none',
        message: 'Phone verified! Please also verify your email to complete Tier 0 verification.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid OTP' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verifyPhone(
    @CurrentUser('id') userId: string,
    @Body() dto: VerifyPhoneDto,
  ) {
    return this.authService.verifyPhone(userId, dto);
  }

  @Post('resend-phone-otp')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 600000 } }) // 3 per 10 minutes
  @ApiOperation({
    summary: 'Resend phone OTP',
    description: 'Resends the OTP to the user\'s registered phone number.',
  })
  @ApiResponse({
    status: 200,
    description: 'OTP resent',
    schema: {
      example: {
        sent: true,
        message: 'OTP sent successfully',
        otp: '123456 (development only)',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Phone already verified or rate limit exceeded' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resendPhoneOtp(@CurrentUser('id') userId: string) {
    return this.authService.resendPhoneOtp(userId);
  }

  @Post('resend-email-verification')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ short: { limit: 3, ttl: 600000 } }) // 3 per 10 minutes
  @ApiOperation({
    summary: 'Resend email verification',
    description: 'Resends the verification email. Maximum 3 resend attempts allowed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email resent',
    schema: {
      example: {
        sent: true,
        message: 'Verification email resent to john.doe@gmail.com',
        remainingAttempts: 2,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Email already verified or max attempts reached' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async resendEmailVerification(@CurrentUser('id') userId: string) {
    return this.authService.resendEmailVerification(userId);
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    try {
      const result = await this.emailService.verifyEmailToken(token);

      return res.render('email-verified', {
        success: true,
        type: result.type,
        tierUpdated: result.tierUpdated,
        newTier: result.newTier,
        error: null,
      });
    } catch (error) {
      return res.render('email-verified', {
        success: false,
        type: null,
        tierUpdated: false,
        newTier: null,
        error: error.message || 'Verification failed',
      });
    }
  }

  @Get('verification-status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get verification status',
    description: 'Returns the current verification status for phone and email.',
  })
  @ApiResponse({
    status: 200,
    description: 'Verification status',
    schema: {
      example: {
        verificationTier: 'tier_0',
        phoneVerified: true,
        emailVerified: true,
        canUpgradeToTier0: false,
      },
    },
  })
  async getVerificationStatus(@CurrentUser('id') userId: string) {
    return this.authService.getVerificationStatus(userId);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  @ApiOperation({
    summary: 'Login with email and password',
    description: 'Authenticates user with email and password. Returns access and refresh tokens.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. For mobile: tokens in response body. For web: tokens in HTTP-only cookies.',
    schema: {
      example: {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: '550e8400-e29b-41d4-a716-446655440000',
            email: 'john.doe@university.edu.ng',
            fullName: 'John Doe',
            avatarUrl: 'https://example.com/avatar.jpg',
          },
          tokens: {
            accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (mobile only)',
            refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (mobile only)',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    schema: {
      example: {
        statusCode: 401,
        message: 'Invalid email or password',
        error: 'Unauthorized',
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Account banned',
    schema: {
      example: {
        statusCode: 403,
        message: 'Your account has been banned. Reason: Policy violation',
        error: 'Forbidden',
      },
    },
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    // For web platform, set tokens as HTTP-only cookies
    if (dto.platform === LoginPlatform.WEB) {
      res.cookie('access_token', result.tokens.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie('refresh_token', result.tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/v1/auth/refresh', // Only send refresh token to refresh endpoint
      });

      // Return response without tokens in body for web
      return {
        user: result.user,
        message: 'Login successful',
      };
    }

    // For mobile platform, return tokens in response body
    return result;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 600000 } }) // 3 per 10 minutes
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Sends a password reset email if the account exists. Always returns success to prevent email enumeration.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent (if account exists)',
    schema: {
      example: {
        message:
          'If an account exists with this email, you will receive a password reset link shortly.',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Get('reset-password')
  async showResetPasswordForm(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    // Validate token exists
    if (!token) {
      return res.render('reset-password', {
        success: false,
        showForm: false,
        error: 'No reset token provided',
        token: null,
      });
    }

    // Validate token is valid
    const validation = await this.authService.validateResetToken(token);

    if (!validation.valid) {
      return res.render('reset-password', {
        success: false,
        showForm: false,
        error: validation.error,
        token: null,
      });
    }

    // Show the reset form
    return res.render('reset-password', {
      success: false,
      showForm: true,
      error: null,
      token,
    });
  }

  /**
   * Handle password reset form submission
   */
  @Public()
  @Post('reset-password')
  @Throttle({ short: { limit: 5, ttl: 600000 } }) // 5 per 10 minutes
  async resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
    @Body('confirmPassword') confirmPassword: string,
    @Res() res: Response,
  ) {
    // Server-side validation
    const errors: string[] = [];

    // Validate token
    if (!token || typeof token !== 'string') {
      return res.render('reset-password', {
        success: false,
        showForm: false,
        error: 'Invalid reset token',
        token: null,
      });
    }

    // Sanitize and validate password
    if (!newPassword || typeof newPassword !== 'string') {
      errors.push('Password is required');
    } else {
      // Check length
      if (newPassword.length < 8) {
        errors.push('Password must be at least 8 characters');
      }
      if (newPassword.length > 50) {
        errors.push('Password must be less than 100 characters');
      }
      // Check complexity
      if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
        errors.push('Password must contain uppercase, lowercase, and a number');
      }
    }

    // Validate confirm password
    if (!confirmPassword || confirmPassword !== newPassword) {
      errors.push('Passwords do not match');
    }

    // If validation errors, show form with error
    if (errors.length > 0) {
      return res.render('reset-password', {
        success: false,
        showForm: true,
        error: errors[0],
        token,
      });
    }

    // Attempt to reset password
    const result = await this.authService.resetPassword(token, newPassword);

    if (!result.success) {
      return res.render('reset-password', {
        success: false,
        showForm: !result.error?.includes('expired') && !result.error?.includes('Invalid') && !result.error?.includes('already been used'),
        error: result.error,
        token: result.error?.includes('expired') || result.error?.includes('Invalid') || result.error?.includes('already been used') ? null : token,
      });
    }

    // Success
    return res.render('reset-password', {
      success: true,
      showForm: false,
      error: null,
      token: null,
    });
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Uses a valid refresh token to obtain new access and refresh tokens. For mobile: send token in body. For web: token is read from HTTP-only cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully. For mobile: tokens in response body. For web: tokens in HTTP-only cookies.',
    schema: {
      example: {
        success: true,
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (mobile only)',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9... (mobile only)',
        },
        message: 'Tokens refreshed successfully',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
    @Headers('cookie') cookieHeader: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // For web platform, get refresh token from cookie
    let refreshToken = dto.refreshToken;

    if (dto.platform === LoginPlatform.WEB && !refreshToken && cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      refreshToken = cookies['refresh_token'];
    }

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    // Decode token to get user ID
    const { sub: userId } = JSON.parse(
      Buffer.from(refreshToken.split('.')[1], 'base64').toString(),
    );

    const tokens = await this.authService.refreshTokens(userId, refreshToken);
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    // For web platform, set tokens as HTTP-only cookies
    if (dto.platform === LoginPlatform.WEB) {
      res.cookie('access_token', tokens.accessToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie('refresh_token', tokens.refreshToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/api/v1/auth/refresh',
      });

      return {
        success: true,
        message: 'Tokens refreshed successfully',
      };
    }

    // For mobile platform, return tokens in response body
    return tokens;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidates the current refresh token and blacklists the access token, logging out the user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      example: {
        success: true,
        message: 'Logged out successfully',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - invalid or missing access token',
  })
  async logout(
    @CurrentUser('id') userId: string,
    @Headers('authorization') authHeader: string,
    @Headers('cookie') cookieHeader: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Extract access token from Authorization header or cookie
    let accessToken: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    } else if (cookieHeader) {
      const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
        const [key, value] = cookie.trim().split('=');
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);
      accessToken = cookies['access_token'];
    }

    // Clear cookies if they exist
    if (cookieHeader?.includes('access_token') || cookieHeader?.includes('refresh_token')) {
      const isProduction = this.configService.get('NODE_ENV') === 'production';

      res.clearCookie('access_token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
      });

      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? 'strict' : 'lax',
        path: '/api/v1/auth/refresh',
      });
    }

    return this.authService.logout(userId, accessToken);
  }
}
