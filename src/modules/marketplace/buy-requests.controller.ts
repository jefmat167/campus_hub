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
import { TierGuard, TierAmountLimit, TierAmountLimitGuard } from '../../common/guards/tier.guard';
import { TIER_BUYING_LIMITS } from '../../common/constants/tier-limits';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { BuyRequestStatus } from '../../database/entities/buy-request.entity';
import { BuyRequestsService } from './buy-requests.service';
import {
  CreateBuyRequestDto,
  UpdateBuyRequestDto,
  BuyRequestQueryDto,
  MyBuyRequestsQueryDto,
} from './dto';

@ApiTags('Marketplace - Buy Requests')
@Controller('marketplace/requests')
export class BuyRequestsController {
  constructor(private readonly buyRequestsService: BuyRequestsService) { }

  @Post()
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard, TierAmountLimitGuard)
  @MinTier(VerificationTier.TIER_1)
  @TierAmountLimit(['budgetMax', 'budgetMin'], TIER_BUYING_LIMITS)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a new buy request',
    description:
      'Creates a new buy request to find items you want to purchase. Requires Tier 1 verification. Tier 1 users limited to ₦60,000 budget.',
  })
  @ApiResponse({
    status: 201,
    description: 'Buy request created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Looking for a used MacBook Pro',
          description: 'Need a MacBook Pro 2020 or newer...',
          category: 'laptops',
          budgetMin: 400000,
          budgetMax: 500000,
          urgency: 'within_a_week',
          visibilityScope: 'university',
          status: 'open',
          viewCount: 0,
          requester: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            fullName: 'John Doe',
          },
          createdAt: '2024-01-15T10:30:00Z',
        },
        message: 'Buy request created successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient verification tier' })
  async createBuyRequest(
    @CurrentUser() user: User,
    @Body() dto: CreateBuyRequestDto,
  ) {
    const request = await this.buyRequestsService.createBuyRequest(user.id, dto);
    return {
      success: true,
      data: request,
      message: 'Buy request created successfully',
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, StudentAccountGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Search buy requests',
    description:
      'Search and filter buy requests. Requires authentication — results are scoped to YOUR university.',
  })
  @ApiResponse({
    status: 200,
    description: 'Buy requests retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          requests: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              title: 'Looking for a used MacBook Pro',
              budgetMin: 400000,
              budgetMax: 500000,
              urgency: 'asap',
              category: 'laptops',
              requester: {
                id: '550e8400-e29b-41d4-a716-446655440001',
                fullName: 'John Doe',
              },
              createdAt: '2024-01-15T10:30:00Z',
            },
          ],
          total: 25,
          page: 1,
          limit: 20,
          totalPages: 2,
          hasNextPage: true,
          hasPrevPage: false,
        },
      },
    },
  })
  async searchBuyRequests(
    @Query() query: BuyRequestQueryDto,
    @CurrentUser() user?: User,
  ) {
    const result = await this.buyRequestsService.searchBuyRequests(query, user);
    return {
      success: true,
      data: result,
    };
  }

  @Get('my-requests')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user buy requests',
    description:
      'Retrieves all buy requests created by the current user. Requires Tier 1 verification.',
  })
  @ApiResponse({
    status: 200,
    description: 'User buy requests retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          requests: [
            {
              id: '550e8400-e29b-41d4-a716-446655440000',
              title: 'Looking for a used MacBook Pro',
              budgetMin: 400000,
              budgetMax: 500000,
              status: 'open',
              viewCount: 15,
              createdAt: '2024-01-15T10:30:00Z',
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
  async getUserBuyRequests(
    @CurrentUser() user: User,
    @Query() query: MyBuyRequestsQueryDto,
  ) {
    const result = await this.buyRequestsService.getUserBuyRequests(
      user.id,
      query.status,
      query.page ?? 1,
      query.limit ?? 20,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, StudentAccountGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get buy request by ID',
    description: 'Retrieves a single buy request by its ID. Increments view count.',
  })
  @ApiParam({
    name: 'id',
    description: 'Buy Request UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Buy request retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Looking for a used MacBook Pro',
          description: 'Need a MacBook Pro 2020 or newer...',
          category: 'laptops',
          budgetMin: 400000,
          budgetMax: 500000,
          urgency: 'within_a_week',
          visibilityScope: 'university',
          status: 'open',
          viewCount: 16,
          requester: {
            id: '550e8400-e29b-41d4-a716-446655440001',
            fullName: 'John Doe',
            faculty: { id: '...', name: 'Faculty of Science' },
            department: { id: '...', name: 'Computer Science' },
          },
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Buy request not found' })
  async getBuyRequestById(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user?: User,
  ) {
    const request = await this.buyRequestsService.getBuyRequestByIdAndIncrementViews(
      id,
      user?.id,
    );
    return {
      success: true,
      data: request,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard, TierAmountLimitGuard)
  @MinTier(VerificationTier.TIER_1)
  @TierAmountLimit(['budgetMax', 'budgetMin'], TIER_BUYING_LIMITS)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a buy request',
    description:
      'Partially updates an existing buy request. Only the owner can update their request. Tier 1 users limited to ₦60,000 budget.',
  })
  @ApiParam({
    name: 'id',
    description: 'Buy Request UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Buy request updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Looking for a used MacBook Pro - Updated',
          budgetMin: 350000,
          budgetMax: 450000,
          updatedAt: '2024-01-16T14:00:00Z',
        },
        message: 'Buy request updated successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error or request not open' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this request' })
  @ApiResponse({ status: 404, description: 'Buy request not found' })
  async updateBuyRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateBuyRequestDto,
  ) {
    const request = await this.buyRequestsService.updateBuyRequest(
      id,
      user.id,
      dto,
    );
    return {
      success: true,
      data: request,
      message: 'Buy request updated successfully',
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a buy request',
    description:
      'Cancels (soft deletes) a buy request. Only the owner can cancel their request. Requires Tier 1 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'Buy Request UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Buy request cancelled successfully',
    schema: {
      example: {
        success: true,
        message: 'Buy request cancelled successfully',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Request not open' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this request' })
  @ApiResponse({ status: 404, description: 'Buy request not found' })
  async cancelBuyRequest(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.buyRequestsService.cancelBuyRequest(id, user.id);
    return {
      success: true,
      message: 'Buy request cancelled successfully',
    };
  }

  @Patch(':id/fulfilled')
  @UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Mark buy request as fulfilled',
    description:
      'Marks a buy request as fulfilled when you have found what you were looking for. Only the owner can mark their request as fulfilled.',
  })
  @ApiParam({
    name: 'id',
    description: 'Buy Request UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Buy request marked as fulfilled',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          status: 'fulfilled',
          updatedAt: '2024-01-16T15:00:00Z',
        },
        message: 'Buy request marked as fulfilled',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Request not open' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Not the owner of this request' })
  @ApiResponse({ status: 404, description: 'Buy request not found' })
  async markAsFulfilled(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const request = await this.buyRequestsService.markAsFulfilled(id, user.id);
    return {
      success: true,
      data: request,
      message: 'Buy request marked as fulfilled',
    };
  }
}
