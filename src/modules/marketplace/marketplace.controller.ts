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
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
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
import { StudentAccountGuard } from '../../common/guards/student-account.guard';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TierGuard, TierAmountLimit, TierAmountLimitGuard } from '../../common/guards/tier.guard';
import { TIER_SELLING_LIMITS } from '../../common/constants/tier-limits';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { ListingStatus } from '../../database/entities/listing.entity';
import { MarketplaceService } from './marketplace.service';
import { AdminAuditService } from '../admin/admin-audit.service';
import { AuditAction, AuditTargetType } from '../../database/entities/admin-audit-log.entity';
import {
  CreateListingDto,
  UpdateListingDto,
  ListingQueryDto,
} from './dto';
import { AdminListListingsDto } from './dto/admin-list-listings.dto';
import { AdminTakedownDto } from './dto/admin-takedown.dto';

@ApiTags('Marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Post('listings')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard, TierAmountLimitGuard)
  @MinTier(VerificationTier.TIER_1)
  @TierAmountLimit('price', TIER_SELLING_LIMITS)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new listing',
    description: 'Creates a new marketplace listing. Requires Tier 1 verification. Tier 1 users limited to ₦50,000.',
  })
  @ApiResponse({
    status: 201,
    description: 'Listing created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'iPhone 13 Pro Max - 256GB - Like New',
          description: 'Selling my iPhone 13 Pro Max...',
          category: 'electronics',
          condition: 'like_new',
          price: 450000,
          isNegotiable: true,
          status: 'active',
          imageUrls: ['https://storage.example.com/listings/img1.jpg'],
          seller: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            fullName: 'John Doe',
            avatarUrl: 'https://storage.example.com/avatars/user1.jpg',
          },
          createdAt: '2024-01-15T10:30:00Z',
        },
        message: 'Listing created successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createListing(
    @CurrentUser() user: User,
    @Body() dto: CreateListingDto,
  ) {
    const listing = await this.marketplaceService.createListing(user.id, dto);
    return {
      success: true,
      data: listing,
      message: 'Listing created successfully',
    };
  }

  @Get('listings')
  @UseGuards(JwtAuthGuard, StudentAccountGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search listings',
    description: 'Search and filter marketplace listings. Public endpoint with optional authentication for personalized results.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listings retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          listings: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              title: 'iPhone 13 Pro Max - 256GB',
              price: 450000,
              condition: 'like_new',
              imageUrls: ['https://storage.example.com/listings/img1.jpg'],
              isFavorited: true,
              seller: {
                id: '550e8400-e29b-41d4-a716-446655440001',
                fullName: 'John Doe',
                isIdVerified: true,
              },
              createdAt: '2024-01-15T10:30:00Z',
            },
          ],
          total: 150,
          page: 1,
          limit: 20,
          totalPages: 8,
          hasNextPage: true,
          hasPrevPage: false,
        },
      },
    },
  })
  async searchListings(
    @Query() query: ListingQueryDto,
    @CurrentUser() user?: User,
  ) {
    const result = await this.marketplaceService.searchListings(query, user);
    return {
      success: true,
      data: result,
    };
  }

  @Get('listings/:id')
  @UseGuards(JwtAuthGuard, StudentAccountGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get listing by ID',
    description: 'Retrieves a single listing by its ID. Increments view count.',
  })
  @ApiParam({
    name: 'id',
    description: 'Listing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'iPhone 13 Pro Max - 256GB - Like New',
          description: 'Selling my iPhone 13 Pro Max, 256GB storage...',
          category: 'electronics',
          condition: 'like_new',
          price: 450000,
          isNegotiable: true,
          status: 'active',
          viewCount: 125,
          favoriteCount: 15,
          isFavorited: true,
          meetupPoints: ['Faculty of Science Building', 'Main gate', 'Library Building'],
          imageUrls: [
            'https://storage.example.com/listings/img1.jpg',
            'https://storage.example.com/listings/img2.jpg',
          ],
          seller: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            fullName: 'John Doe',
            avatarUrl: 'https://storage.example.com/avatars/user1.jpg',
            isIdVerified: true,
            trustScore: 92,
          },
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-16T08:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async getListingById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User,
  ) {
    const listing = await this.marketplaceService.getListingByIdAndIncrementViews(
      id,
      user?.id,
    );
    return {
      success: true,
      data: listing,
    };
  }

  @Patch('listings/:id')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard, TierAmountLimitGuard)
  @MinTier(VerificationTier.TIER_1)
  @TierAmountLimit('price', TIER_SELLING_LIMITS)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a listing',
    description: 'Partially updates an existing listing. Only the owner can update their listing. Tier 1 users limited to ₦50,000 price.',
  })
  @ApiParam({
    name: 'id',
    description: 'Listing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'iPhone 13 Pro Max - 256GB - Price Reduced!',
          price: 400000,
          updatedAt: '2024-01-16T14:00:00Z',
        },
        message: 'Listing updated successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async updateListing(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateListingDto,
  ) {
    const listing = await this.marketplaceService.updateListing(
      id,
      user.id,
      dto,
    );
    return {
      success: true,
      data: listing,
      message: 'Listing updated successfully',
    };
  }

  @Delete('listings/:id')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a listing',
    description: 'Soft deletes a listing. Only the owner can delete their listing. Requires Tier 1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Listing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Listing deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async deleteListing(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.marketplaceService.deleteListing(id, user.id);
    return {
      success: true,
      message: 'Listing deleted successfully',
    };
  }

  @Patch('listings/:id/sold')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark listing as sold',
    description: 'Marks a listing as sold. Only the owner can mark their listing as sold. Requires Tier 1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Listing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing marked as sold',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'sold',
          soldAt: '2024-01-16T15:00:00Z',
        },
        message: 'Listing marked as sold',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this listing' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async markAsSold(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const listing = await this.marketplaceService.markAsSold(id, user.id);
    return {
      success: true,
      data: listing,
      message: 'Listing marked as sold',
    };
  }

  @Post('favorites/:listingId')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add listing to favorites',
    description: 'Adds a listing to the user\'s favorites. Requires Tier 0 verification.',
  })
  @ApiParam({
    name: 'listingId',
    description: 'Listing UUID to favorite',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Added to favorites',
    schema: {
      example: {
        success: true,
        message: 'Added to favorites',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async addToFavorites(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: User,
  ) {
    await this.marketplaceService.addToFavorites(user.id, listingId);
    return {
      success: true,
      message: 'Added to favorites',
    };
  }

  @Delete('favorites/:listingId')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remove listing from favorites',
    description: 'Removes a listing from the user\'s favorites. Requires Tier 0 verification.',
  })
  @ApiParam({
    name: 'listingId',
    description: 'Listing UUID to unfavorite',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Removed from favorites',
    schema: {
      example: {
        success: true,
        message: 'Removed from favorites',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async removeFromFavorites(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: User,
  ) {
    await this.marketplaceService.removeFromFavorites(user.id, listingId);
    return {
      success: true,
      message: 'Removed from favorites',
    };
  }

  @Get('favorites')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get user favorites',
    description: 'Retrieves all listings favorited by the current user. Requires Tier 0 verification.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Favorites retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          listings: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              title: 'iPhone 13 Pro Max',
              price: 450000,
              status: 'active',
              favoritedAt: '2024-01-15T10:30:00Z',
            },
          ],
          total: 5,
          page: 1,
          limit: 20,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserFavorites(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.marketplaceService.getUserFavorites(
      user.id,
      page || 1,
      limit || 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('my-listings')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user listings',
    description: 'Retrieves all listings created by the current user. Requires Tier 1 verification.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ListingStatus,
    example: ListingStatus.ACTIVE,
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'User listings retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          listings: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              title: 'iPhone 13 Pro Max',
              price: 450000,
              status: 'active',
              viewCount: 125,
              favoriteCount: 15,
              createdAt: '2024-01-15T10:30:00Z',
            },
          ],
          total: 10,
          page: 1,
          limit: 20,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUserListings(
    @CurrentUser() user: User,
    @Query('status') status?: ListingStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.marketplaceService.getUserListings(
      user.id,
      status,
      page || 1,
      limit || 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  // ─── Admin Endpoints ──────────────────────────────────────────

  @Get('admin/listings')
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MARKETPLACE_READ)
  @ApiOperation({ summary: 'List all listings (admin)', description: 'Paginated, filterable by status, category, seller, price, etc.' })
  @ApiResponse({
    status: 200,
    description: 'Listings retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            title: 'Samsung Galaxy S23 Ultra - 512GB',
            description: 'Fairly used Samsung Galaxy S23 Ultra in excellent condition. Comes with charger and case.',
            category: 'electronics',
            condition: 'fairly_used',
            price: 380000,
            status: 'active',
            viewCount: 87,
            favoriteCount: 12,
            seller: {
              id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              fullName: 'Emeka Okonkwo',
            },
            createdAt: '2026-04-10T09:15:00.000Z',
          },
        ],
        meta: { total: 245, page: 1, limit: 20, pages: 13 },
      },
    },
  })
  async adminListListings(@Query() dto: AdminListListingsDto) {
    const { listings, total } = await this.marketplaceService.adminListListings(dto);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    return {
      success: true,
      data: listings,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  @Post('admin/listings/:id/takedown')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MARKETPLACE_MANAGE)
  @ApiOperation({ summary: 'Takedown a listing (admin)', description: 'Sets listing status to DELETED with reason.' })
  @ApiParam({ name: 'id', description: 'Listing UUID' })
  @ApiResponse({
    status: 200,
    description: 'Listing taken down',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Samsung Galaxy S23 Ultra - 512GB',
          status: 'deleted',
          sellerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          updatedAt: '2026-04-15T11:20:00.000Z',
        },
        message: 'Listing taken down',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async adminTakedownListing(
    @CurrentAdmin('id') adminId: string,
    @Param('id', ParseUUIDPipe) listingId: string,
    @Body() dto: AdminTakedownDto,
  ) {
    const listing = await this.marketplaceService.adminTakedownListing(listingId);

    await this.auditService.log(
      adminId,
      AuditAction.LISTING_TAKEDOWN,
      AuditTargetType.LISTING,
      listingId,
      dto.reason,
    );

    return {
      success: true,
      data: listing,
      message: 'Listing taken down',
    };
  }
}
