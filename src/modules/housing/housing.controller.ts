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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
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

  @Post()
  @MinTier(VerificationTier.TIER_1)
  @TierAmountLimit('price', {
    [VerificationTier.TIER_1]: 50000,
    [VerificationTier.TIER_2]: null, // unlimited
  })
  @ApiOperation({
    summary: 'Create a new housing listing',
    description:
      'Creates a new housing listing for rent. Requires TIER_1 verification. ' +
      'TIER_1 users are limited to listings with maximum ₦50,000 rent. ' +
      'TIER_2 users have no price limit. Listings are scoped to the user\'s university.',
  })
  @ApiResponse({
    status: 201,
    description: 'Housing listing created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
          landlordId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          universityId: 'u1v2w3x4-y5z6-7890-abcd-ef1234567890',
          title: 'Spacious Self-Contain Near UNILAG Main Gate',
          description: 'Well-maintained self-contain apartment with 24/7 water supply, prepaid meter, and excellent security. Located 5 minutes walk from the main gate.',
          type: 'self_contain',
          status: 'available',
          price: 400000,
          paymentFrequency: 'yearly',
          cautionFee: 35000,
          agentFee: 17500,
          address: '15 University Road, Akoka, Lagos',
          area: 'Akoka',
          latitude: 6.5244,
          longitude: 3.3792,
          bedrooms: 1,
          bathrooms: 1,
          furnishing: 'semi_furnished',
          genderPreference: 'any',
          hasWater: true,
          hasElectricity: true,
          hasInternet: false,
          hasParking: true,
          hasSecurityGuard: true,
          hasGenerator: false,
          hasPrepaidMeter: true,
          isGated: true,
          allowsPets: false,
          otherAmenities: ['Water heater'],
          imageUrls: ['https://storage.example.com/housing/img1.jpg'],
          videoUrl: null,
          rules: 'No loud music after 10pm.',
          availableFrom: '2024-02-01',
          viewCount: 0,
          inquiryCount: 0,
          isVerified: false,
          verifiedAt: null,
          createdAt: '2024-01-20T10:30:00.000Z',
          updatedAt: '2024-01-20T10:30:00.000Z',
        },
        message: 'Housing listing created successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data or price exceeds tier limit',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification requirement or price exceeds tier limit (₦50,000 for TIER_1)',
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

  @Get()
  @ApiOperation({
    summary: 'Search housing listings',
    description:
      'Search and filter available housing listings within the user\'s university. ' +
      'Supports text search, price range, housing type, amenities, and more. ' +
      'Results can be sorted by price, date, or popularity. Requires TIER_0 verification.',
  })
  @ApiResponse({
    status: 200,
    description: 'Housing listings retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
            landlordId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
            title: 'Spacious Self-Contain Near UNILAG Main Gate',
            description: 'Well-maintained self-contain apartment with 24/7 water supply...',
            type: 'self_contain',
            status: 'available',
            price: 400000,
            paymentFrequency: 'yearly',
            cautionFee: 35000,
            address: '15 University Road, Akoka, Lagos',
            area: 'Akoka',
            bedrooms: 1,
            bathrooms: 1,
            furnishing: 'semi_furnished',
            hasWater: true,
            hasElectricity: true,
            hasGenerator: false,
            imageUrls: ['https://storage.example.com/housing/img1.jpg'],
            isVerified: true,
            viewCount: 145,
            createdAt: '2024-01-15T10:30:00.000Z',
          },
          {
            id: 'h2b3c4d5-e6f7-8901-bcde-f12345678901',
            landlordId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: 'Cozy Room in Shared Flat - Female Only',
            description: 'Clean and comfortable room in a 3-bedroom flat shared with 2 other female students...',
            type: 'room',
            status: 'available',
            price: 25000,
            paymentFrequency: 'monthly',
            cautionFee: 25000,
            address: '8 Iwaya Road, Yaba, Lagos',
            area: 'Yaba',
            bedrooms: 1,
            bathrooms: 1,
            furnishing: 'furnished',
            hasWater: true,
            hasElectricity: true,
            hasGenerator: true,
            imageUrls: ['https://storage.example.com/housing/img2.jpg'],
            isVerified: false,
            viewCount: 89,
            createdAt: '2024-01-18T14:20:00.000Z',
          },
        ],
        meta: {
          total: 47,
          page: 1,
          limit: 20,
          pages: 3,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_0 verification requirement',
  })
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

  @Get('mine')
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Get my housing listings',
    description:
      'Retrieves all housing listings created by the authenticated user. ' +
      'Includes listings of all statuses (available, rented, paused, etc.). ' +
      'Requires TIER_1 verification.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Page number (default: 1)',
    example: 1,
    type: Number,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of results per page (default: 20)',
    example: 20,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'User listings retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
            title: 'Spacious Self-Contain Near UNILAG Main Gate',
            type: 'self_contain',
            status: 'available',
            price: 400000,
            paymentFrequency: 'yearly',
            area: 'Akoka',
            bedrooms: 1,
            bathrooms: 1,
            imageUrls: ['https://storage.example.com/housing/img1.jpg'],
            viewCount: 145,
            inquiryCount: 12,
            isVerified: true,
            createdAt: '2024-01-15T10:30:00.000Z',
          },
          {
            id: 'h2b3c4d5-e6f7-8901-bcde-f12345678901',
            title: '2 Bedroom Flat in Bariga',
            type: 'flat',
            status: 'rented',
            price: 960000,
            paymentFrequency: 'yearly',
            area: 'Bariga',
            bedrooms: 2,
            bathrooms: 2,
            imageUrls: ['https://storage.example.com/housing/img3.jpg'],
            viewCount: 234,
            inquiryCount: 28,
            isVerified: true,
            createdAt: '2023-12-01T08:00:00.000Z',
          },
        ],
        meta: {
          total: 2,
          page: 1,
          limit: 20,
          pages: 1,
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification requirement',
  })
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

  @Get(':id')
  @ApiOperation({
    summary: 'Get a single housing listing',
    description:
      'Retrieves detailed information about a specific housing listing. ' +
      'Increments the view count for analytics. Requires TIER_0 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Housing listing UUID',
    example: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Housing listing retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
          landlordId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          universityId: 'u1v2w3x4-y5z6-7890-abcd-ef1234567890',
          title: 'Spacious Self-Contain Near UNILAG Main Gate',
          description: 'Well-maintained self-contain apartment with 24/7 water supply, prepaid meter, and excellent security. Located 5 minutes walk from the main gate. Perfect for students who value privacy and convenience.',
          type: 'self_contain',
          status: 'available',
          price: 400000,
          paymentFrequency: 'yearly',
          cautionFee: 35000,
          agentFee: 17500,
          address: '15 University Road, Akoka, Lagos',
          area: 'Akoka',
          latitude: 6.5244,
          longitude: 3.3792,
          bedrooms: 1,
          bathrooms: 1,
          furnishing: 'semi_furnished',
          genderPreference: 'any',
          hasWater: true,
          hasElectricity: true,
          hasInternet: false,
          hasParking: true,
          hasSecurityGuard: true,
          hasGenerator: false,
          hasPrepaidMeter: true,
          isGated: true,
          allowsPets: false,
          otherAmenities: ['Water heater', 'Wardrobe'],
          imageUrls: [
            'https://storage.example.com/housing/img1.jpg',
            'https://storage.example.com/housing/img2.jpg',
          ],
          videoUrl: 'https://storage.example.com/housing/tour.mp4',
          rules: 'No loud music after 10pm. No overnight guests without prior notice.',
          availableFrom: '2024-02-01',
          viewCount: 146,
          inquiryCount: 12,
          isVerified: true,
          verifiedAt: '2024-01-16T14:00:00.000Z',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-20T08:15:00.000Z',
          landlord: {
            id: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
            firstName: 'Oluwaseun',
            lastName: 'Adeyemi',
            avatarUrl: 'https://storage.example.com/avatars/seun.jpg',
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_0 verification requirement',
  })
  @ApiResponse({
    status: 404,
    description: 'Housing listing not found',
  })
  async getListing(@Param('id', ParseUUIDPipe) id: string) {
    const listing = await this.housingService.getListing(id);

    return {
      success: true,
      data: listing,
    };
  }

  @Patch(':id')
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Update a housing listing',
    description:
      'Updates an existing housing listing. Only the listing owner can update it. ' +
      'All fields are optional - only provided fields will be updated. ' +
      'Requires TIER_1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Housing listing UUID',
    example: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Housing listing updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
          landlordId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          title: 'Spacious Self-Contain Near UNILAG Main Gate - Updated Price!',
          type: 'self_contain',
          status: 'available',
          price: 380000,
          paymentFrequency: 'yearly',
          cautionFee: 32000,
          address: '15 University Road, Akoka, Lagos',
          area: 'Akoka',
          bedrooms: 1,
          bathrooms: 1,
          furnishing: 'semi_furnished',
          hasWater: true,
          hasElectricity: true,
          imageUrls: ['https://storage.example.com/housing/img1.jpg'],
          isVerified: true,
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-22T09:45:00.000Z',
        },
        message: 'Listing updated successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Invalid input data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification or is not the listing owner',
  })
  @ApiResponse({
    status: 404,
    description: 'Housing listing not found',
  })
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

  @Patch(':id/mark-rented')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark listing as rented',
    description:
      'Marks a housing listing as rented. The listing will no longer appear in search results. ' +
      'Only the listing owner can perform this action. Use reactivate endpoint to make it available again. ' +
      'Requires TIER_1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Housing listing UUID',
    example: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing marked as rented successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
          title: 'Spacious Self-Contain Near UNILAG Main Gate',
          type: 'self_contain',
          status: 'rented',
          price: 400000,
          paymentFrequency: 'yearly',
          area: 'Akoka',
          updatedAt: '2024-01-25T11:00:00.000Z',
        },
        message: 'Listing marked as rented',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification or is not the listing owner',
  })
  @ApiResponse({
    status: 404,
    description: 'Housing listing not found',
  })
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

  @Patch(':id/pause')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause a housing listing',
    description:
      'Temporarily pauses a housing listing. Paused listings do not appear in search results ' +
      'but can be reactivated later. Useful when temporarily not accepting inquiries. ' +
      'Only the listing owner can perform this action. Requires TIER_1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Housing listing UUID',
    example: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing paused successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
          title: 'Spacious Self-Contain Near UNILAG Main Gate',
          type: 'self_contain',
          status: 'paused',
          price: 400000,
          paymentFrequency: 'yearly',
          area: 'Akoka',
          updatedAt: '2024-01-25T11:30:00.000Z',
        },
        message: 'Listing paused',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification or is not the listing owner',
  })
  @ApiResponse({
    status: 404,
    description: 'Housing listing not found',
  })
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

  @Patch(':id/reactivate')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivate a housing listing',
    description:
      'Reactivates a paused or rented housing listing, making it available again in search results. ' +
      'Only the listing owner can perform this action. Cannot reactivate deleted listings. ' +
      'Requires TIER_1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Housing listing UUID',
    example: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing reactivated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
          title: 'Spacious Self-Contain Near UNILAG Main Gate',
          type: 'self_contain',
          status: 'available',
          price: 400000,
          paymentFrequency: 'yearly',
          area: 'Akoka',
          updatedAt: '2024-01-26T08:00:00.000Z',
        },
        message: 'Listing reactivated',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Cannot reactivate a deleted listing',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification or is not the listing owner',
  })
  @ApiResponse({
    status: 404,
    description: 'Housing listing not found',
  })
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

  @Delete(':id')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a housing listing',
    description:
      'Soft-deletes a housing listing. The listing will no longer appear in search results ' +
      'and cannot be reactivated. Only the listing owner can perform this action. ' +
      'This action cannot be undone. Requires TIER_1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Housing listing UUID',
    example: 'h1a2b3c4-d5e6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Listing deleted',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification or is not the listing owner',
  })
  @ApiResponse({
    status: 404,
    description: 'Housing listing not found',
  })
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
