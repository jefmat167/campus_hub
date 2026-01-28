import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { RoommateService } from './roommate.service';
import { CreateRoommateProfileDto, ExpressInterestDto } from './dto';

@ApiTags('Roommates')
@Controller('roommates')
@UseGuards(JwtAuthGuard, TierGuard)
@MinTier(VerificationTier.TIER_1)
@ApiBearerAuth()
export class RoommateController {
  constructor(private readonly roommateService: RoommateService) {}

  /**
   * Create or update roommate profile
   */
  @Post('profile')
  async createOrUpdateProfile(
    @CurrentUser() user: User,
    @Body() dto: CreateRoommateProfileDto,
  ) {
    const profile = await this.roommateService.createOrUpdateProfile(
      user.id,
      user.universityId,
      dto,
    );

    return {
      success: true,
      data: profile,
      message: 'Roommate profile saved',
    };
  }

  /**
   * Get my roommate profile
   */
  @Get('profile')
  async getMyProfile(@CurrentUser() user: User) {
    const profile = await this.roommateService.getMyProfile(user.id);

    return {
      success: true,
      data: profile,
    };
  }

  /**
   * Get a roommate profile by ID
   */
  @Get('profile/:id')
  async getProfile(@Param('id', ParseUUIDPipe) id: string) {
    const profile = await this.roommateService.getProfile(id);

    return {
      success: true,
      data: profile,
    };
  }

  /**
   * Find compatible roommates
   */
  @Get('matches')
  async findMatches(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { matches, total } = await this.roommateService.findMatches(
      user.id,
      Number(page) || 1,
      Number(limit) || 20,
    );

    return {
      success: true,
      data: matches,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Express interest in a roommate
   */
  @Post('interest/:profileId')
  async expressInterest(
    @CurrentUser() user: User,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: ExpressInterestDto,
  ) {
    const interest = await this.roommateService.expressInterest(
      user.id,
      profileId,
      dto,
    );

    return {
      success: true,
      data: interest,
      message: 'Interest expressed successfully',
    };
  }

  /**
   * Get received interests
   */
  @Get('interests/received')
  async getReceivedInterests(
    @CurrentUser() user: User,
    @Query('status') status?: 'pending' | 'accepted' | 'declined',
  ) {
    const interests = await this.roommateService.getReceivedInterests(
      user.id,
      status,
    );

    return {
      success: true,
      data: interests,
    };
  }

  /**
   * Get sent interests
   */
  @Get('interests/sent')
  async getSentInterests(@CurrentUser() user: User) {
    const interests = await this.roommateService.getSentInterests(user.id);

    return {
      success: true,
      data: interests,
    };
  }

  /**
   * Accept interest
   */
  @Patch('interests/:id/accept')
  @HttpCode(HttpStatus.OK)
  async acceptInterest(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const interest = await this.roommateService.respondToInterest(
      id,
      user.id,
      true,
    );

    return {
      success: true,
      data: interest,
      message: 'Interest accepted',
    };
  }

  /**
   * Decline interest
   */
  @Patch('interests/:id/decline')
  @HttpCode(HttpStatus.OK)
  async declineInterest(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const interest = await this.roommateService.respondToInterest(
      id,
      user.id,
      false,
    );

    return {
      success: true,
      data: interest,
      message: 'Interest declined',
    };
  }

  /**
   * Toggle profile status (pause/unpause)
   */
  @Patch('profile/toggle-status')
  @HttpCode(HttpStatus.OK)
  async toggleProfileStatus(@CurrentUser() user: User) {
    const profile = await this.roommateService.toggleProfileStatus(user.id);

    return {
      success: true,
      data: profile,
      message: `Profile ${profile.status === 'active' ? 'activated' : 'paused'}`,
    };
  }
}
