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
import { TierGuard, TierAmountLimit, TierAmountLimitGuard } from '../../common/guards/tier.guard';
import { TIER_BUYING_LIMITS } from '../../common/constants/tier-limits';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { OfferStatus } from '../../database/entities/offer.entity';
import { OffersService } from './offers.service';
import { CreateOfferDto, RespondOfferDto } from './dto';

@ApiTags('Offers')
@Controller('offers')
@UseGuards(JwtAuthGuard, TierGuard, TierAmountLimitGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @TierAmountLimit('amount', TIER_BUYING_LIMITS)
  @ApiOperation({
    summary: 'Create a new offer',
    description: 'Creates a new offer on a listing. Buyers can make offers below the listing price. Amount limits: Tier 0 ≤₦30k, Tier 1 ≤₦60k, Tier 2 unlimited.',
  })
  @ApiResponse({
    status: 201,
    description: 'Offer created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          listingId: '550e8400-e29b-41d4-a716-446655440001',
          buyerId: '550e8400-e29b-41d4-a716-446655440002',
          amount: 400000,
          status: 'pending',
          message: 'Hi, I am interested in this item. Can you do 400k?',
          createdAt: '2024-01-15T10:30:00Z',
        },
        message: 'Offer created successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error or cannot make offer on own listing' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async createOffer(
    @CurrentUser() user: User,
    @Body() dto: CreateOfferDto,
  ) {
    const offer = await this.offersService.createOffer(user.id, dto);
    return {
      success: true,
      data: offer,
      message: 'Offer created successfully',
    };
  }

  @Get('my/sent')
  @ApiOperation({
    summary: 'Get offers sent by current user',
    description: 'Retrieves all offers made by the current user as a buyer.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OfferStatus,
    description: 'Filter by offer status',
    example: OfferStatus.PENDING,
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default 20)' })
  @ApiResponse({
    status: 200,
    description: 'Offers retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          offers: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              amount: 400000,
              status: 'pending',
              listing: {
                id: '550e8400-e29b-41d4-a716-446655440001',
                title: 'iPhone 13 Pro Max',
                price: 450000,
                imageUrls: ['https://storage.example.com/img1.jpg'],
              },
              seller: {
                id: '550e8400-e29b-41d4-a716-446655440002',
                fullName: 'Jane Doe',
              },
              createdAt: '2024-01-15T10:30:00Z',
            },
          ],
          total: 5,
          page: 1,
          totalPages: 1,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getBuyerOffers(
    @CurrentUser() user: User,
    @Query('status') status?: OfferStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.offersService.getBuyerOffers(
      user.id,
      status,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('my/received')
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Get offers received by current user',
    description: 'Retrieves all offers received on the current user\'s listings as a seller. Requires Tier 1 verification.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OfferStatus,
    description: 'Filter by offer status',
    example: OfferStatus.PENDING,
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default 20)' })
  @ApiResponse({
    status: 200,
    description: 'Offers retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          offers: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              amount: 400000,
              status: 'pending',
              listing: {
                id: '550e8400-e29b-41d4-a716-446655440001',
                title: 'iPhone 13 Pro Max',
                price: 450000,
              },
              buyer: {
                id: '550e8400-e29b-41d4-a716-446655440002',
                fullName: 'John Doe',
                isIdVerified: true,
              },
              message: 'Hi, I am interested. Can you do 400k?',
              createdAt: '2024-01-15T10:30:00Z',
            },
          ],
          total: 5,
          page: 1,
          totalPages: 1,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getSellerOffers(
    @CurrentUser() user: User,
    @Query('status') status?: OfferStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.offersService.getSellerOffers(
      user.id,
      status,
      page ? Number(page) : 1,
      limit ? Number(limit) : 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('listing/:listingId')
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Get offers for a specific listing',
    description: 'Retrieves all offers for a listing. Only the listing owner can see all offers. Requires Tier 1 verification.',
  })
  @ApiParam({
    name: 'listingId',
    description: 'Listing UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OfferStatus,
    description: 'Filter by offer status',
  })
  @ApiResponse({
    status: 200,
    description: 'Offers retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            amount: 400000,
            status: 'pending',
            buyer: {
              id: '550e8400-e29b-41d4-a716-446655440002',
              fullName: 'John Doe',
              isIdVerified: true,
            },
            createdAt: '2024-01-15T10:30:00Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not authorized to view offers for this listing' })
  async getOffersForListing(
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @CurrentUser() user: User,
    @Query('status') status?: OfferStatus,
  ) {
    const offers = await this.offersService.getOffersForListing(
      listingId,
      user.id,
      status,
    );
    return {
      success: true,
      data: offers,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get offer by ID',
    description: 'Retrieves a single offer by its ID. Only buyer or seller can view.',
  })
  @ApiParam({
    name: 'id',
    description: 'Offer UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Offer retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          amount: 400000,
          counterAmount: 420000,
          status: 'countered',
          listing: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            title: 'iPhone 13 Pro Max',
            price: 450000,
          },
          buyer: {
            id: '550e8400-e29b-41d4-a716-446655440002',
            fullName: 'John Doe',
          },
          seller: {
            id: '550e8400-e29b-41d4-a716-446655440003',
            fullName: 'Jane Doe',
          },
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T11:00:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not authorized to view this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async getOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const offer = await this.offersService.getOfferById(id, user.id);
    return {
      success: true,
      data: offer,
    };
  }

  @Patch(':id/respond')
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Respond to an offer',
    description: 'Seller responds to an offer by accepting, rejecting, or countering. Requires Tier 1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Offer UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Response recorded successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'countered',
          counterAmount: 420000,
          updatedAt: '2024-01-15T11:00:00Z',
        },
        message: 'Offer countered successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Only seller can respond to offers' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async respondToOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: RespondOfferDto,
  ) {
    const offer = await this.offersService.respondToOffer(id, user.id, dto);
    return {
      success: true,
      data: offer,
      message: `Offer ${dto.action}ed successfully`,
    };
  }

  @Patch(':id/accept-counter')
  @ApiOperation({
    summary: 'Accept counter offer',
    description: 'Buyer accepts the seller\'s counter offer.',
  })
  @ApiParam({
    name: 'id',
    description: 'Offer UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Counter offer accepted',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'accepted',
          finalAmount: 420000,
          updatedAt: '2024-01-15T12:00:00Z',
        },
        message: 'Counter offer accepted successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Offer is not in countered status' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Only buyer can accept counter offers' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async acceptCounterOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const offer = await this.offersService.acceptCounterOffer(id, user.id);
    return {
      success: true,
      data: offer,
      message: 'Counter offer accepted successfully',
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw an offer',
    description: 'Buyer withdraws their pending offer.',
  })
  @ApiParam({
    name: 'id',
    description: 'Offer UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Offer withdrawn successfully',
    schema: {
      example: {
        success: true,
        message: 'Offer withdrawn successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Cannot withdraw non-pending offer' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Only buyer can withdraw their offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async withdrawOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.offersService.withdrawOffer(id, user.id);
    return {
      success: true,
      message: 'Offer withdrawn successfully',
    };
  }
}
