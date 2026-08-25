import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
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
import { StudentAccountGuard } from '../../common/guards/student-account.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto, UpdateReviewDto } from './dto';

@ApiTags('Reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) { }

  @Post()
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a review',
    description:
      'Rate and review the seller of a completed escrow transaction. Only the buyer of the escrow can create a review. Requires Tier 0 verification.',
  })
  @ApiResponse({
    status: 201,
    description: 'Review created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          escrowTransactionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          reviewerId: '123e4567-e89b-12d3-a456-426614174000',
          revieweeId: '987fcdeb-51a2-3bc4-d567-890123456789',
          rating: 5,
          comment:
            'Great seller! Item was exactly as described and delivery was quick.',
          isEdited: false,
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z',
        },
        message: 'Review created successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request or already reviewed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Escrow transaction not found' })
  async createReview(@CurrentUser() user: User, @Body() dto: CreateReviewDto) {
    const review = await this.reviewsService.createReview(user.id, dto);
    return {
      success: true,
      data: review,
      message: 'Review created successfully',
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a review',
    description:
      'Update your own review. Requires Tier 0 verification. Reviews can only be edited within 7 days of creation.',
  })
  @ApiParam({
    name: 'id',
    description: 'Review ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Review updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          escrowTransactionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          reviewerId: '123e4567-e89b-12d3-a456-426614174000',
          revieweeId: '987fcdeb-51a2-3bc4-d567-890123456789',
          rating: 4,
          comment: 'Good seller, but delivery took a bit longer than expected.',
          isEdited: true,
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-16T14:20:00.000Z',
        },
        message: 'Review updated successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Edit window expired (7 days)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not review owner' })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async updateReview(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateReviewDto,
  ) {
    const review = await this.reviewsService.updateReview(id, user.id, dto);
    return {
      success: true,
      data: review,
      message: 'Review updated successfully',
    };
  }

  @Get('user/:userId')
  @ApiOperation({
    summary: 'Get reviews received by a seller',
    description:
      'Get all reviews received by a seller with rating statistics and distribution',
  })
  @ApiParam({
    name: 'userId',
    description: 'Seller ID to get reviews for',
    example: '987fcdeb-51a2-3bc4-d567-890123456789',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of reviews per page (default: 20)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Reviews retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          reviews: [
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              rating: 5,
              comment: 'Excellent seller!',
              isEdited: false,
              createdAt: '2024-01-15T10:30:00.000Z',
              reviewer: {
                id: '123e4567-e89b-12d3-a456-426614174000',
                firstName: 'John',
                lastName: 'Doe',
              },
            },
          ],
          total: 15,
          averageRating: 4.5,
          ratingDistribution: {
            1: 0,
            2: 1,
            3: 2,
            4: 5,
            5: 7,
          },
        },
      },
    },
  })
  async getUserReviews(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.reviewsService.getUserReviews(
      userId,
      page || 1,
      limit || 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('given')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get reviews given by current user',
    description: 'Get all reviews that the authenticated user has written. Requires Tier 0 verification.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of reviews per page (default: 20)',
    example: 20,
  })
  @ApiResponse({
    status: 200,
    description: 'Reviews retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          reviews: [
            {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              rating: 5,
              comment: 'Item as described, fast delivery!',
              isEdited: false,
              createdAt: '2024-01-15T10:30:00.000Z',
              reviewee: {
                id: '987fcdeb-51a2-3bc4-d567-890123456789',
                firstName: 'Jane',
                lastName: 'Smith',
              },
            },
          ],
          total: 8,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getReviewsGivenByUser(
    @CurrentUser() user: User,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    const result = await this.reviewsService.getReviewsGivenByUser(
      user.id,
      page || 1,
      limit || 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('transaction/:escrowTransactionId')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get review for an escrow transaction',
    description:
      'Get the buyer review associated with a specific escrow transaction, if one exists. Requires Tier 0 verification.',
  })
  @ApiParam({
    name: 'escrowTransactionId',
    description: 'Escrow transaction ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiResponse({
    status: 200,
    description: 'Reviews retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            rating: 5,
            comment: 'Great seller!',
            reviewer: { id: '...', firstName: 'John', lastName: 'Doe' },
            reviewee: { id: '...', firstName: 'Jane', lastName: 'Smith' },
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTransactionReviews(
    @Param('escrowTransactionId', ParseUUIDPipe) escrowTransactionId: string,
  ) {
    const reviews =
      await this.reviewsService.getTransactionReviews(escrowTransactionId);
    return {
      success: true,
      data: reviews,
    };
  }

  @Get('can-review/:escrowTransactionId')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Check if user can review an escrow transaction',
    description:
      'Check if the authenticated user is eligible to review a specific escrow transaction. Requires Tier 0 verification.',
  })
  @ApiParam({
    name: 'escrowTransactionId',
    description: 'Escrow transaction ID',
    example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  })
  @ApiResponse({
    status: 200,
    description: 'Eligibility check completed',
    schema: {
      example: {
        success: true,
        data: {
          canReview: true,
          reason: null,
          existingReview: null,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'User already reviewed',
    schema: {
      example: {
        success: true,
        data: {
          canReview: false,
          reason: 'You have already reviewed this transaction',
          existingReview: {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            rating: 5,
            comment: 'Great seller!',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async canReviewTransaction(
    @Param('escrowTransactionId', ParseUUIDPipe) escrowTransactionId: string,
    @CurrentUser() user: User,
  ) {
    const result = await this.reviewsService.canReviewTransaction(
      user.id,
      escrowTransactionId,
    );
    return {
      success: true,
      data: result,
    };
  }

  // NOTE: This route must be LAST because :id matches any path segment
  @Get(':id')
  @ApiOperation({
    summary: 'Get a review by ID',
    description: 'Retrieve a single review by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Review ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Review retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          escrowTransactionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
          reviewerId: '123e4567-e89b-12d3-a456-426614174000',
          revieweeId: '987fcdeb-51a2-3bc4-d567-890123456789',
          rating: 5,
          comment: 'Great seller! Item was exactly as described.',
          isEdited: false,
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z',
          reviewer: {
            id: '123e4567-e89b-12d3-a456-426614174000',
            firstName: 'John',
            lastName: 'Doe',
            avatarUrl: 'https://example.com/avatar.jpg',
          },
          reviewee: {
            id: '987fcdeb-51a2-3bc4-d567-890123456789',
            firstName: 'Jane',
            lastName: 'Smith',
            avatarUrl: 'https://example.com/avatar2.jpg',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Review not found' })
  async getReview(@Param('id', ParseUUIDPipe) id: string) {
    const review = await this.reviewsService.getReviewById(id);
    return {
      success: true,
      data: review,
    };
  }
}
