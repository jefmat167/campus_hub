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
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { RoommateService } from './roommate.service';
import {
  CreateRoommateProfileDto,
  ExpressInterestDto,
  SearchRoommateProfilesDto,
} from './dto';

@ApiTags('Roommates')
@Controller('roommates')
@UseGuards(JwtAuthGuard, TierGuard)
@MinTier(VerificationTier.TIER_1)
@ApiBearerAuth()
export class RoommateController {
  constructor(private readonly roommateService: RoommateService) {}

  @Post('profile')
  @ApiOperation({
    summary: 'Create or update roommate profile',
    description:
      'Creates a new roommate profile or updates an existing one. Each user can only have one roommate profile. ' +
      'The profile is used for compatibility matching with other users seeking roommates. ' +
      'Requires TIER_1 verification.',
  })
  @ApiResponse({
    status: 201,
    description: 'Roommate profile created or updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          userId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          universityId: 'u1v2w3x4-y5z6-7890-abcd-ef1234567890',
          status: 'active',
          gender: 'male',
          age: 21,
          bio: 'Final year Computer Science student. I enjoy coding, gaming, and keeping my space tidy.',
          budgetMin: 20000,
          budgetMax: 40000,
          preferredAreas: ['Akoka', 'Yaba', 'Bariga'],
          moveInDate: '2024-03-01',
          moveInFlexible: true,
          cleanliness: 'clean',
          noiseLevel: 'moderate',
          sleepSchedule: 'night_owl',
          studyHabit: 'quiet_studier',
          smokes: false,
          drinks: false,
          hasPets: false,
          allowsVisitors: true,
          preferredGender: 'male',
          preferredAgeMin: 18,
          preferredAgeMax: 25,
          preferredCleanliness: 'clean',
          preferredNoiseLevel: 'quiet',
          preferredSleepSchedule: 'flexible',
          nonSmokerOnly: true,
          nonDrinkerOnly: false,
          noPetsAllowed: true,
          interests: ['Gaming', 'Football', 'Movies', 'Coding'],
          languages: ['English', 'Yoruba'],
          viewCount: 0,
          interestReceivedCount: 0,
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-15T10:30:00.000Z',
        },
        message: 'Roommate profile saved',
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
  async createOrUpdateProfile(
    @CurrentUser() user: User,
    @Body() dto: CreateRoommateProfileDto,
  ) {
    const profile = await this.roommateService.createOrUpdateProfile(
      user.id,
      user.universityId,
      user.gender,
      dto,
    );

    return {
      success: true,
      data: profile,
      message: 'Roommate profile saved',
    };
  }

  @Get()
  @ApiOperation({
    summary: 'Browse all roommate profiles',
    description:
      'Returns a paginated list of all active roommate profiles within the user\'s university. ' +
      'Excludes the requesting user\'s profile. Supports filtering by gender, budget range, and area. ' +
      'Results are sorted by newest first. Requires TIER_1 verification.',
  })
  @ApiQuery({
    name: 'gender',
    required: false,
    description: 'Filter by gender',
    enum: ['male', 'female'],
    example: 'male',
  })
  @ApiQuery({
    name: 'minBudget',
    required: false,
    description: 'Minimum budget in Naira (finds profiles with budgetMax >= this value)',
    example: 20000,
    type: Number,
  })
  @ApiQuery({
    name: 'maxBudget',
    required: false,
    description: 'Maximum budget in Naira (finds profiles with budgetMin <= this value)',
    example: 50000,
    type: Number,
  })
  @ApiQuery({
    name: 'area',
    required: false,
    description: 'Filter by preferred area (e.g., Akoka, Yaba)',
    example: 'Akoka',
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
    description: 'Roommate profiles retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            userId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
            status: 'active',
            gender: 'male',
            age: 22,
            bio: '300 level Engineering student. Loves football and FIFA.',
            budgetMin: 25000,
            budgetMax: 40000,
            preferredAreas: ['Akoka', 'Bariga'],
            cleanliness: 'clean',
            noiseLevel: 'moderate',
            sleepSchedule: 'night_owl',
            studyHabit: 'background_noise',
            smokes: false,
            drinks: false,
            hasPets: false,
            allowsVisitors: true,
            interests: ['Football', 'Gaming', 'Movies'],
            languages: ['English', 'Yoruba'],
            viewCount: 45,
            interestReceivedCount: 5,
            createdAt: '2024-01-20T10:30:00.000Z',
            updatedAt: '2024-01-20T10:30:00.000Z',
            user: {
              id: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
              fullName: 'Chinedu Okonkwo',
              profilePhotoUrl: 'https://storage.example.com/avatars/chinedu.jpg',
            },
          },
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            userId: 'e2d3c4b5-a6f7-8901-bcde-f12345678901',
            status: 'active',
            gender: 'male',
            age: 21,
            bio: 'Final year Computer Science student. Quiet and studious.',
            budgetMin: 20000,
            budgetMax: 35000,
            preferredAreas: ['Yaba', 'Akoka'],
            cleanliness: 'very_clean',
            noiseLevel: 'quiet',
            sleepSchedule: 'normal',
            studyHabit: 'quiet_studier',
            smokes: false,
            drinks: false,
            hasPets: false,
            allowsVisitors: false,
            interests: ['Reading', 'Chess', 'Coding'],
            languages: ['English'],
            viewCount: 32,
            interestReceivedCount: 3,
            createdAt: '2024-01-18T14:20:00.000Z',
            updatedAt: '2024-01-19T09:15:00.000Z',
            user: {
              id: 'e2d3c4b5-a6f7-8901-bcde-f12345678901',
              fullName: 'Emeka Nwosu',
              profilePhotoUrl: null,
            },
          },
        ],
        meta: {
          total: 25,
          page: 1,
          limit: 20,
          pages: 2,
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
  async getAllProfiles(
    @CurrentUser() user: User,
    @Query() dto: SearchRoommateProfilesDto,
  ) {
    const { profiles, total } = await this.roommateService.getAllProfiles(
      user.id,
      user.universityId,
      user.gender,
      dto,
    );

    const page = dto.page || 1;
    const limit = dto.limit || 20;

    return {
      success: true,
      data: profiles,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  @Get('profile')
  @ApiOperation({
    summary: 'Get my roommate profile',
    description:
      'Retrieves the current authenticated user\'s roommate profile. ' +
      'Returns null if no profile exists yet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Roommate profile retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          userId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          universityId: 'u1v2w3x4-y5z6-7890-abcd-ef1234567890',
          status: 'active',
          gender: 'male',
          age: 21,
          bio: 'Final year Computer Science student.',
          budgetMin: 20000,
          budgetMax: 40000,
          preferredAreas: ['Akoka', 'Yaba'],
          cleanliness: 'clean',
          noiseLevel: 'moderate',
          sleepSchedule: 'night_owl',
          studyHabit: 'quiet_studier',
          smokes: false,
          drinks: false,
          hasPets: false,
          allowsVisitors: true,
          interests: ['Gaming', 'Coding'],
          languages: ['English', 'Yoruba'],
          viewCount: 15,
          interestReceivedCount: 3,
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-20T14:45:00.000Z',
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
  async getMyProfile(@CurrentUser() user: User) {
    const profile = await this.roommateService.getMyProfile(user.id);

    return {
      success: true,
      data: profile,
    };
  }

  @Get('profile/:id')
  @ApiOperation({
    summary: 'Get roommate profile by ID',
    description:
      'Retrieves a specific roommate profile by its ID. ' +
      'Useful for viewing another user\'s profile before expressing interest.',
  })
  @ApiParam({
    name: 'id',
    description: 'Roommate profile UUID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Roommate profile retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          userId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          status: 'active',
          gender: 'female',
          age: 20,
          bio: '200 level Law student. Looking for a quiet and clean roommate.',
          budgetMin: 25000,
          budgetMax: 45000,
          preferredAreas: ['Akoka', 'Iwaya'],
          cleanliness: 'very_clean',
          noiseLevel: 'quiet',
          sleepSchedule: 'early_bird',
          studyHabit: 'library_studier',
          smokes: false,
          drinks: false,
          hasPets: false,
          allowsVisitors: false,
          interests: ['Reading', 'Music', 'Debate'],
          languages: ['English', 'Igbo'],
          viewCount: 42,
          interestReceivedCount: 8,
          createdAt: '2024-01-10T08:00:00.000Z',
          updatedAt: '2024-01-18T16:20:00.000Z',
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
  @ApiResponse({
    status: 404,
    description: 'Roommate profile not found',
  })
  async getProfile(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const profile = await this.roommateService.getProfile(id, user.gender);

    return {
      success: true,
      data: profile,
    };
  }

  @Get('matches')
  @ApiOperation({
    summary: 'Find compatible roommates',
    description:
      'Returns a paginated list of compatible roommate profiles sorted by compatibility score (highest first). ' +
      'The compatibility algorithm considers budget overlap (20pts), cleanliness (15pts), noise level (15pts), ' +
      'sleep schedule (15pts), age compatibility (10pts), lifestyle factors (10pts), area overlap (10pts), ' +
      'and shared interests (5pts). Excludes profiles you have already expressed interest in.',
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
    description: 'Number of results per page (default: 20, max: 50)',
    example: 20,
    type: Number,
  })
  @ApiResponse({
    status: 200,
    description: 'Compatible roommates retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            profile: {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              userId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
              status: 'active',
              gender: 'male',
              age: 22,
              bio: '300 level Engineering student. Loves football and FIFA.',
              budgetMin: 25000,
              budgetMax: 35000,
              preferredAreas: ['Akoka', 'Bariga'],
              cleanliness: 'clean',
              noiseLevel: 'moderate',
              sleepSchedule: 'night_owl',
              smokes: false,
              drinks: false,
              interests: ['Football', 'Gaming', 'Movies'],
              languages: ['English', 'Yoruba'],
            },
            compatibilityScore: 87.5,
          },
          {
            profile: {
              id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
              userId: 'e2d3c4b5-a6f7-8901-bcde-f12345678901',
              status: 'active',
              gender: 'male',
              age: 21,
              bio: 'Final year student. Quiet and studious.',
              budgetMin: 20000,
              budgetMax: 40000,
              preferredAreas: ['Yaba', 'Akoka'],
              cleanliness: 'very_clean',
              noiseLevel: 'quiet',
              sleepSchedule: 'normal',
              smokes: false,
              drinks: false,
              interests: ['Reading', 'Chess'],
              languages: ['English'],
            },
            compatibilityScore: 72.3,
          },
        ],
        meta: {
          total: 15,
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
  @ApiResponse({
    status: 404,
    description: 'You must create a roommate profile first',
  })
  async findMatches(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { matches, total } = await this.roommateService.findMatches(
      user.id,
      user.gender,
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

  @Post('interest/:profileId')
  @ApiOperation({
    summary: 'Express interest in a roommate',
    description:
      'Send an interest request to another user\'s roommate profile. ' +
      'The recipient will be notified and can accept or decline. ' +
      'You can only express interest once per profile. ' +
      'An optional message can be included to introduce yourself.',
  })
  @ApiParam({
    name: 'profileId',
    description: 'The roommate profile ID to express interest in',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 201,
    description: 'Interest expressed successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          fromUserId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          toUserId: 'd4e5f6a7-b8c9-0123-defg-234567890123',
          status: 'pending',
          message: 'Hi! I saw your profile and I think we would be great roommates. I am also looking for a place in Akoka.',
          compatibilityScore: 85.0,
          createdAt: '2024-01-20T14:30:00.000Z',
          updatedAt: '2024-01-20T14:30:00.000Z',
        },
        message: 'Interest expressed successfully',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Cannot express interest in yourself or already expressed interest',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification requirement',
  })
  @ApiResponse({
    status: 404,
    description: 'Roommate profile not found or you must create a profile first',
  })
  async expressInterest(
    @CurrentUser() user: User,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: ExpressInterestDto,
  ) {
    const interest = await this.roommateService.expressInterest(
      user.id,
      user.gender,
      profileId,
      dto,
    );

    return {
      success: true,
      data: interest,
      message: 'Interest expressed successfully',
    };
  }

  @Get('interests/received')
  @ApiOperation({
    summary: 'Get received interests',
    description:
      'Retrieves all interest requests you have received from other users. ' +
      'Optionally filter by status (pending, accepted, declined). ' +
      'Includes the sender\'s profile information and compatibility score.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by interest status',
    enum: ['pending', 'accepted', 'declined'],
    example: 'pending',
  })
  @ApiResponse({
    status: 200,
    description: 'Received interests retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            fromUserId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
            toUserId: 'd4e5f6a7-b8c9-0123-defg-234567890123',
            status: 'pending',
            message: 'Hi! I think we would be great roommates.',
            compatibilityScore: 85.0,
            createdAt: '2024-01-20T14:30:00.000Z',
            updatedAt: '2024-01-20T14:30:00.000Z',
            fromUser: {
              id: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
              firstName: 'Chinedu',
              lastName: 'Okonkwo',
              avatarUrl: 'https://example.com/avatars/chinedu.jpg',
            },
          },
          {
            id: 'd4e5f6a7-b8c9-0123-defg-234567890123',
            fromUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            toUserId: 'd4e5f6a7-b8c9-0123-defg-234567890123',
            status: 'pending',
            message: null,
            compatibilityScore: 72.5,
            createdAt: '2024-01-19T10:15:00.000Z',
            updatedAt: '2024-01-19T10:15:00.000Z',
            fromUser: {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              firstName: 'Adebayo',
              lastName: 'Ogunleye',
              avatarUrl: null,
            },
          },
        ],
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

  @Get('interests/sent')
  @ApiOperation({
    summary: 'Get sent interests',
    description:
      'Retrieves all interest requests you have sent to other users. ' +
      'Includes the recipient\'s profile information, compatibility score, and current status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Sent interests retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
            fromUserId: 'd4e5f6a7-b8c9-0123-defg-234567890123',
            toUserId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
            status: 'accepted',
            message: 'Hi! I think we would be great roommates.',
            compatibilityScore: 88.5,
            createdAt: '2024-01-18T09:00:00.000Z',
            updatedAt: '2024-01-19T15:30:00.000Z',
            toUser: {
              id: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
              firstName: 'Ngozi',
              lastName: 'Eze',
              avatarUrl: 'https://example.com/avatars/ngozi.jpg',
            },
          },
          {
            id: 'e5f6a7b8-c9d0-1234-efgh-345678901234',
            fromUserId: 'd4e5f6a7-b8c9-0123-defg-234567890123',
            toUserId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            status: 'pending',
            message: 'Looking forward to connecting!',
            compatibilityScore: 76.0,
            createdAt: '2024-01-20T11:45:00.000Z',
            updatedAt: '2024-01-20T11:45:00.000Z',
            toUser: {
              id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
              firstName: 'Emeka',
              lastName: 'Nwosu',
              avatarUrl: null,
            },
          },
        ],
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
  async getSentInterests(@CurrentUser() user: User) {
    const interests = await this.roommateService.getSentInterests(user.id);

    return {
      success: true,
      data: interests,
    };
  }

  @Patch('interests/:id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Accept interest request',
    description:
      'Accept an interest request from another user. ' +
      'If both parties have accepted each other\'s interest, both profiles will be marked as MATCHED. ' +
      'Matched users can then proceed to chat and coordinate further.',
  })
  @ApiParam({
    name: 'id',
    description: 'Interest request UUID',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'Interest accepted successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          fromUserId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          toUserId: 'd4e5f6a7-b8c9-0123-defg-234567890123',
          status: 'accepted',
          message: 'Hi! I think we would be great roommates.',
          compatibilityScore: 85.0,
          createdAt: '2024-01-20T14:30:00.000Z',
          updatedAt: '2024-01-21T09:15:00.000Z',
        },
        message: 'Interest accepted',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Interest has already been responded to',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification or not the recipient of this interest',
  })
  @ApiResponse({
    status: 404,
    description: 'Interest request not found',
  })
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

  @Patch('interests/:id/decline')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decline interest request',
    description:
      'Decline an interest request from another user. ' +
      'The sender will not be notified of the decline. ' +
      'This action cannot be undone.',
  })
  @ApiParam({
    name: 'id',
    description: 'Interest request UUID',
    example: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'Interest declined successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c3d4e5f6-a7b8-9012-cdef-123456789012',
          fromUserId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          toUserId: 'd4e5f6a7-b8c9-0123-defg-234567890123',
          status: 'declined',
          message: 'Hi! I think we would be great roommates.',
          compatibilityScore: 65.0,
          createdAt: '2024-01-20T14:30:00.000Z',
          updatedAt: '2024-01-21T10:00:00.000Z',
        },
        message: 'Interest declined',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request - Interest has already been responded to',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token missing or invalid',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User does not meet TIER_1 verification or not the recipient of this interest',
  })
  @ApiResponse({
    status: 404,
    description: 'Interest request not found',
  })
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

  @Patch('profile/toggle-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toggle profile status (pause/unpause)',
    description:
      'Toggles the roommate profile between active and paused states. ' +
      'When paused, your profile will not appear in search results and you will not receive new interest requests. ' +
      'Existing interests are preserved. Use this if you are temporarily not looking for a roommate.',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile status toggled successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          userId: 'f1e2d3c4-b5a6-7890-abcd-ef1234567890',
          status: 'paused',
          gender: 'male',
          age: 21,
          bio: 'Final year Computer Science student.',
          budgetMin: 20000,
          budgetMax: 40000,
          cleanliness: 'clean',
          noiseLevel: 'moderate',
          createdAt: '2024-01-15T10:30:00.000Z',
          updatedAt: '2024-01-22T08:00:00.000Z',
        },
        message: 'Profile paused',
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
  @ApiResponse({
    status: 404,
    description: 'Roommate profile not found - create a profile first',
  })
  async toggleProfileStatus(@CurrentUser() user: User) {
    const profile = await this.roommateService.toggleProfileStatus(user.id);

    return {
      success: true,
      data: profile,
      message: `Profile ${profile.status === 'active' ? 'activated' : 'paused'}`,
    };
  }
}
