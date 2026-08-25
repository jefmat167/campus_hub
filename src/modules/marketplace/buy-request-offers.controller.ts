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
import {
  TierGuard,
  TierAmountLimit,
  TierAmountLimitGuard,
} from '../../common/guards/tier.guard';
import { TIER_BUYING_LIMITS } from '../../common/constants/tier-limits';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { BuyRequestOfferStatus } from '../../database/entities/buy-request-offer.entity';
import { BuyRequestOffersService } from './buy-request-offers.service';
import {
  CreateBuyRequestOfferDto,
  RespondBuyRequestOfferDto,
  BuyRequestOfferQueryDto,
} from './dto';

@ApiTags('Marketplace - Buy Request Offers')
@Controller('marketplace/requests')
@UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
@ApiBearerAuth()
export class BuyRequestOffersController {
  constructor(private readonly offersService: BuyRequestOffersService) {}

  @Post(':requestId/offers')
  @UseGuards(TierAmountLimitGuard)
  @MinTier(VerificationTier.TIER_1)
  @TierAmountLimit('proposedPrice', TIER_BUYING_LIMITS)
  @ApiOperation({
    summary: 'Submit an offer to a buy request',
    description:
      'Sellers submit structured offers to fulfill a buy request. Creates a conversation automatically. TIER_1 limit: ₦60,000.',
  })
  @ApiParam({ name: 'requestId', description: 'Buy Request UUID' })
  @ApiResponse({
    status: 201,
    description: 'Offer submitted successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          proposedPrice: 45000,
          itemCondition: 'like_new',
          status: 'pending',
          conversationId: '550e8400-e29b-41d4-a716-446655440001',
          expiresAt: '2024-01-17T10:30:00Z',
          createdAt: '2024-01-15T10:30:00Z',
        },
        message: 'Offer submitted successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error or request not open' })
  @ApiResponse({
    status: 403,
    description: 'Cannot offer on own request or tier limit exceeded',
  })
  @ApiResponse({ status: 404, description: 'Buy request not found' })
  @ApiResponse({ status: 409, description: 'Already have a pending offer' })
  async createOffer(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateBuyRequestOfferDto,
  ) {
    const offer = await this.offersService.createOffer(user.id, requestId, dto);
    return {
      success: true,
      data: offer,
      message: 'Offer submitted successfully',
    };
  }

  @Get(':requestId/offers')
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'List offers on a buy request',
    description: 'Requester views all offers received on their buy request.',
  })
  @ApiParam({ name: 'requestId', description: 'Buy Request UUID' })
  @ApiQuery({ name: 'status', enum: BuyRequestOfferStatus, required: false })
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
              proposedPrice: 45000,
              itemCondition: 'like_new',
              status: 'pending',
              message: 'I have a MacBook Pro 2021...',
              imageUrl: 'https://storage.example.com/item.jpg',
              responder: {
                id: '...',
                fullName: 'Jane Seller',
                verificationTier: 'tier_1',
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
  @ApiResponse({ status: 403, description: 'Only requester can view offers' })
  @ApiResponse({ status: 404, description: 'Buy request not found' })
  async getOffersForRequest(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: User,
    @Query('status') status?: BuyRequestOfferStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.offersService.getOffersForRequest(
      requestId,
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

  @Patch(':requestId/offers/:offerId/respond')
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Respond to an offer',
    description:
      'Requester accepts or rejects an offer. Accepting auto-rejects other pending offers and marks request as fulfilled.',
  })
  @ApiParam({ name: 'requestId', description: 'Buy Request UUID' })
  @ApiParam({ name: 'offerId', description: 'Offer UUID' })
  @ApiResponse({
    status: 200,
    description: 'Response recorded successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'accepted',
          respondedAt: '2024-01-15T11:00:00Z',
        },
        message: 'Offer accepted',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Offer expired or invalid status' })
  @ApiResponse({ status: 403, description: 'Only requester can respond' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async respondToOffer(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: User,
    @Body() dto: RespondBuyRequestOfferDto,
  ) {
    const offer = await this.offersService.respondToOffer(offerId, user.id, dto);
    return {
      success: true,
      data: offer,
      message: `Offer ${dto.action}ed`,
    };
  }

  @Delete(':requestId/offers/:offerId')
  @MinTier(VerificationTier.TIER_1)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Withdraw an offer',
    description: 'Responder withdraws their pending offer.',
  })
  @ApiParam({ name: 'requestId', description: 'Buy Request UUID' })
  @ApiParam({ name: 'offerId', description: 'Offer UUID' })
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
  @ApiResponse({ status: 403, description: 'Only responder can withdraw' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async withdrawOffer(
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @CurrentUser() user: User,
  ) {
    await this.offersService.withdrawOffer(offerId, user.id);
    return {
      success: true,
      message: 'Offer withdrawn successfully',
    };
  }
}

/**
 * Separate controller for responder's own offers
 */
@ApiTags('Marketplace - My Offers')
@Controller('marketplace/offers')
@UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
@MinTier(VerificationTier.TIER_1)
@ApiBearerAuth()
export class MyBuyRequestOffersController {
  constructor(private readonly offersService: BuyRequestOffersService) {}

  @Get('my-responses')
  @ApiOperation({
    summary: 'Get offers I have submitted',
    description: 'Retrieves all offers the current user has submitted as a responder.',
  })
  @ApiResponse({
    status: 200,
    description: 'Offers retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          offers: [
            {
              id: '...',
              proposedPrice: 45000,
              status: 'pending',
              buyRequest: {
                id: '...',
                title: 'Looking for MacBook Pro',
                budgetMin: 40000,
                budgetMax: 50000,
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
  async getMyResponses(
    @CurrentUser() user: User,
    @Query() query: BuyRequestOfferQueryDto,
  ) {
    const result = await this.offersService.getResponderOffers(
      user.id,
      query.status,
      query.page,
      query.limit,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get offer by ID',
    description: 'Retrieves a single offer. Only responder or requester can view.',
  })
  @ApiParam({ name: 'id', description: 'Offer UUID' })
  @ApiResponse({ status: 200, description: 'Offer retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to view' })
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
}
