import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard, TierAmountLimit, TierAmountLimitGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { HousingStatus } from '../../database/entities/housing.entity';
import { HousingService } from './housing.service';
import { CreateHousingDto, SearchHousingDto } from './dto';

@ApiTags('Housing')
@Controller('housing')
@UseGuards(JwtAuthGuard, TierGuard, TierAmountLimitGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class HousingController {
  constructor(private readonly housingService: HousingService) {}

  /**
   * Create a new housing listing
   * Requires Tier 1 verification. Tier 1 users limited to ₦50,000/month.
   */
  @Post()
  @MinTier(VerificationTier.TIER_1)
  @TierAmountLimit('pricePerMonth', {
    [VerificationTier.TIER_1]: 50000,
    [VerificationTier.TIER_2]: null, // unlimited
  })
  async createListing(
    @CurrentUser() user: User,
    @Body() dto: CreateHousingDto,
  ) {
    const listing = await this.housingService.createListing(
      user.id,
      user.universityId,
      dto,
    );

    return {
      success: true,
      data: listing,
      message: 'Housing listing created successfully',
    };
  }

  /**
   * Search housing listings
   */
  @Get()
  async searchListings(
    @CurrentUser() user: User,
    @Query() dto: SearchHousingDto,
  ) {
    const { listings, total } = await this.housingService.searchListings(
      user.universityId,
      dto,
    );

    return {
      success: true,
      data: listings,
      meta: {
        total,
        page: dto.page || 1,
        limit: dto.limit || 20,
        pages: Math.ceil(total / (dto.limit || 20)),
      },
    };
  }

  /**
   * Get user's own listings
   * Requires Tier 1 verification.
   */
  @Get('mine')
  @MinTier(VerificationTier.TIER_1)
  async getMyListings(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { listings, total } = await this.housingService.getMyListings(
      user.id,
      Number(page) || 1,
      Number(limit) || 20,
    );

    return {
      success: true,
      data: listings,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Get a single listing
   */
  @Get(':id')
  async getListing(@Param('id', ParseUUIDPipe) id: string) {
    const listing = await this.housingService.getListing(id);

    return {
      success: true,
      data: listing,
    };
  }

  /**
   * Update a listing
   * Requires Tier 1 verification.
   */
  @Patch(':id')
  @MinTier(VerificationTier.TIER_1)
  async updateListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateHousingDto>,
  ) {
    const listing = await this.housingService.updateListing(id, user.id, dto);

    return {
      success: true,
      data: listing,
      message: 'Listing updated successfully',
    };
  }

  /**
   * Mark listing as rented
   * Requires Tier 1 verification.
   */
  @Patch(':id/mark-rented')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  async markAsRented(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.updateStatus(
      id,
      user.id,
      HousingStatus.RENTED,
    );

    return {
      success: true,
      data: listing,
      message: 'Listing marked as rented',
    };
  }

  /**
   * Pause listing
   * Requires Tier 1 verification.
   */
  @Patch(':id/pause')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  async pauseListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.updateStatus(
      id,
      user.id,
      HousingStatus.PAUSED,
    );

    return {
      success: true,
      data: listing,
      message: 'Listing paused',
    };
  }

  /**
   * Reactivate listing
   * Requires Tier 1 verification.
   */
  @Patch(':id/reactivate')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  async reactivateListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.updateStatus(
      id,
      user.id,
      HousingStatus.AVAILABLE,
    );

    return {
      success: true,
      data: listing,
      message: 'Listing reactivated',
    };
  }

  /**
   * Delete listing
   * Requires Tier 1 verification.
   */
  @Delete(':id')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  async deleteListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.housingService.deleteListing(id, user.id);

    return {
      success: true,
      message: 'Listing deleted',
    };
  }
}
