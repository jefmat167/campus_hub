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
  Req,
} from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, VerifyPhoneDto } from './dto';
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

  /**
   * Verify phone number with OTP
   */
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

  /**
   * Resend phone OTP
   */
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

  /**
   * Resend email verification
   */
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

  /**
   * Verify email via token (from clicked link)
   */
  @Public()
  @Get('verify-email')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Verify email address',
    description: 'Verifies the email address using the token from the verification link. Redirects to frontend.',
  })
  @ApiQuery({ name: 'token', description: 'Verification token from email link' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with result' })
  async verifyEmail(
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

    try {
      const result = await this.emailService.verifyEmailToken(token);

      const redirectUrl = new URL(`${frontendUrl}/auth/email-verified`);
      redirectUrl.searchParams.set('success', 'true');
      redirectUrl.searchParams.set('type', result.type);
      if (result.tierUpdated) {
        redirectUrl.searchParams.set('tierUpdated', 'true');
        redirectUrl.searchParams.set('newTier', result.newTier || '');
      }

      return res.redirect(redirectUrl.toString());
    } catch (error) {
      const redirectUrl = new URL(`${frontendUrl}/auth/email-verified`);
      redirectUrl.searchParams.set('success', 'false');
      redirectUrl.searchParams.set('error', error.message || 'Verification failed');

      return res.redirect(redirectUrl.toString());
    }
  }

  /**
   * Get verification status
   */
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

  // Commented out: Use GET /users/me instead for full profile with relations
  // @Post('me')
  // @HttpCode(HttpStatus.OK)
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // @ApiOperation({
  //   summary: 'Get current user',
  //   description: 'Returns the currently authenticated user\'s profile.',
  // })
  // @ApiResponse({
  //   status: 200,
  //   description: 'Current user data',
  //   schema: {
  //     example: {
  //       user: {
  //         id: '550e8400-e29b-41d4-a716-446655440000',
  //         email: 'john.doe@university.edu.ng',
  //         fullName: 'John Doe',
  //         phone: '+2348012345678',
  //         avatarUrl: 'https://example.com/avatar.jpg',
  //         bio: 'Computer Science student',
  //         isPhoneVerified: true,
  //         isEmailVerified: true,
  //         isIdVerified: false,
  //         createdAt: '2024-01-15T10:30:00Z',
  //       },
  //     },
  //   },
  // })
  // @ApiResponse({
  //   status: 401,
  //   description: 'Unauthorized',
  // })
  // async me(@CurrentUser() user: User) {
  //   return { user };
  // }
}
