import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the full profile of the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'john.doe@university.edu.ng',
        fullName: 'John Doe',
        phone: '+2348012345678',
        avatarUrl: 'https://storage.example.com/avatars/user123.jpg',
        bio: 'Computer Science student passionate about mobile development',
        yearOfStudy: 'year_3',
        isPhoneVerified: true,
        isEmailVerified: true,
        isIdVerified: false,
        trustScore: 85,
        university: {
          id: '550e8400-e29b-41d4-a716-446655440001',
          name: 'University of Lagos',
          shortName: 'UNILAG',
        },
        faculty: {
          id: '550e8400-e29b-41d4-a716-446655440002',
          name: 'Faculty of Science',
        },
        department: {
          id: '550e8400-e29b-41d4-a716-446655440003',
          name: 'Computer Science',
        },
        createdAt: '2024-01-15T10:30:00Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMyProfile(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description: 'Updates the profile of the currently authenticated user. All fields are optional.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated successfully',
    schema: {
      example: {
        success: true,
        message: 'Profile updated successfully',
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          fullName: 'John Doe Updated',
          bio: 'Updated bio text',
          yearOfStudy: 'year_4',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async updateMyProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Get public profile of another user',
    description: 'Returns the public profile of another user. Only accessible if the viewer is from the same university. Requires Tier 0 verification.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the user',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiResponse({
    status: 200,
    description: 'Public profile retrieved successfully',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        fullName: 'Jane Smith',
        avatarUrl: 'https://storage.example.com/avatars/user456.jpg',
        bio: 'Engineering student',
        yearOfStudy: 'year_2',
        isIdVerified: true,
        trustScore: 92,
        totalListings: 15,
        totalSales: 8,
        averageRating: 4.8,
        memberSince: '2023-09-01T00:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Cannot view users from other universities' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getPublicProfile(
    @Param('id', ParseUUIDPipe) userId: string,
    @CurrentUser('id') viewerId: string,
  ) {
    return this.usersService.getPublicProfile(userId, viewerId);
  }

  @Get('me/can-transact')
  @ApiOperation({
    summary: 'Check if user can transact',
    description: 'Checks if the current user meets the requirements to buy/sell on the marketplace (phone verified, not banned, etc.).',
  })
  @ApiResponse({
    status: 200,
    description: 'Transaction eligibility status',
    schema: {
      example: {
        canTransact: true,
        reasons: [],
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'User cannot transact',
    schema: {
      example: {
        canTransact: false,
        reasons: [
          'Phone number not verified',
          'ID verification required for transactions over ₦50,000',
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async canTransact(@CurrentUser('id') userId: string) {
    return this.usersService.canTransact(userId);
  }
}
