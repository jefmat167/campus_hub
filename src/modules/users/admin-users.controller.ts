import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { UsersService } from './users.service';
import { AdminListUsersDto } from './dto/admin-list-users.dto';
import { AdminChangeRoleDto } from './dto/admin-change-role.dto';
import { AdminAdjustTierDto } from './dto/admin-adjust-tier.dto';

@ApiTags('Admin - Users')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) { }

  @Get('list')
  @RequirePermission(AdminPermissions.USERS_READ)
  @ApiOperation({
    summary: 'List all users',
    description: 'Search and filter all users. Supports pagination, search by name/email/phone, and filters.',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            email: 'chidi.okafor@unilag.edu.ng',
            fullName: 'Chidi Okafor',
            phone: '2348101234567',
            verificationTier: 'tier_1',
            role: 'USER',
            isBanned: false,
            university: {
              id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
              name: 'University of Lagos',
              shortName: 'UNILAG',
            },
            createdAt: '2025-09-14T10:23:00.000Z',
            lastActiveAt: '2026-04-25T18:45:12.000Z',
          },
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            email: 'amina.bello@buk.edu.ng',
            fullName: 'Amina Bello',
            phone: '2349031234567',
            verificationTier: 'tier_0',
            role: 'USER',
            isBanned: false,
            university: {
              id: 'e8a1c3b5-49dd-4a72-b890-1d02a3c4d580',
              name: 'Bayero University Kano',
              shortName: 'BUK',
            },
            createdAt: '2025-11-02T08:15:00.000Z',
            lastActiveAt: '2026-04-24T12:30:45.000Z',
          },
        ],
        meta: {
          total: 842,
          page: 1,
          limit: 20,
          pages: 43,
        },
      },
    },
  })
  async listUsers(@Query() dto: AdminListUsersDto) {
    const { users, total } = await this.usersService.adminListUsers(dto);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    return {
      success: true,
      data: users,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  @Get(':userId')
  @RequirePermission(AdminPermissions.USERS_READ)
  @ApiOperation({
    summary: 'Get user detail (admin view)',
    description: 'Full admin view of a user including wallet, transactions, listing counts, reports, and warnings.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User detail retrieved',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          email: 'chidi.okafor@unilag.edu.ng',
          fullName: 'Chidi Okafor',
          phone: '2348101234567',
          verificationTier: 'tier_1',
          role: 'USER',
          isBanned: false,
          bio: 'Final year Computer Science student',
          yearOfStudy: 'YEAR_4',
          profilePhotoUrl: 'https://res.cloudinary.com/campus-hub/image/upload/v1/avatars/chidi-okafor.jpg',
          university: {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            name: 'University of Lagos',
            shortName: 'UNILAG',
          },
          createdAt: '2025-09-14T10:23:00.000Z',
          lastActiveAt: '2026-04-25T18:45:12.000Z',
          walletBalance: 45250.0,
          transactionCounts: {
            totalEscrows: 12,
            completedEscrows: 10,
            cancelledEscrows: 2,
          },
          listingCounts: {
            activeListings: 3,
            totalListings: 8,
          },
          reports: {
            reportsFiled: 1,
            reportsReceived: 0,
          },
          warnings: [],
          sellerRating: 4.7,
          sellerRatingCount: 10,
          completedTransactions: 10,
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'User not found',
        error: 'Not Found',
        timestamp: '2026-04-26T09:15:00.000Z',
        path: '/api/v1/admin/users/a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      },
    },
  })
  async getUserDetail(@Param('userId', ParseUUIDPipe) userId: string) {
    return {
      success: true,
      data: await this.usersService.adminGetUserDetail(userId),
    };
  }

  @Patch(':userId/role')
  @RequirePermission(AdminPermissions.USERS_MANAGE)
  @ApiOperation({
    summary: 'Change user role',
    description: 'Change a user\'s role. Only SUPER_ADMIN can assign ADMIN/SUPER_ADMIN roles.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Role updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          email: 'amina.bello@buk.edu.ng',
          fullName: 'Amina Bello',
          phone: '2349031234567',
          verificationTier: 'tier_0',
          role: 'MODERATOR',
          isBanned: false,
          university: {
            id: 'e8a1c3b5-49dd-4a72-b890-1d02a3c4d580',
            name: 'Bayero University Kano',
            shortName: 'BUK',
          },
          createdAt: '2025-11-02T08:15:00.000Z',
          lastActiveAt: '2026-04-24T12:30:45.000Z',
        },
        message: 'User role updated to MODERATOR',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot change own role or insufficient permissions',
    schema: {
      example: {
        statusCode: 400,
        message: 'Cannot change your own role',
        error: 'Bad Request',
        timestamp: '2026-04-26T09:20:00.000Z',
        path: '/api/v1/admin/users/b2c3d4e5-f6a7-8901-bcde-f12345678901/role',
      },
    },
  })
  async changeRole(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() admin: User,
    @Body() dto: AdminChangeRoleDto,
  ) {
    return this.usersService.adminChangeRole(userId, admin.id, admin.role, dto);
  }

  @Post(':userId/force-logout')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.USERS_MANAGE)
  @ApiOperation({
    summary: 'Force logout user',
    description: 'Invalidates the user\'s refresh token. Current access token expires naturally in 15 minutes.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User sessions invalidated',
    schema: {
      example: {
        success: true,
        message: 'All sessions invalidated for user c3d4e5f6-a7b8-9012-cdef-123456789012. Active access tokens will expire within 15 minutes.',
      },
    },
  })
  async forceLogout(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.usersService.adminForceLogout(userId, adminId);
  }

  @Patch(':userId/tier')
  @RequirePermission(AdminPermissions.USERS_MANAGE)
  @ApiOperation({
    summary: 'Adjust user verification tier',
    description: 'Manually set a user\'s verification tier with a reason.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'Tier updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          email: 'chidi.okafor@unilag.edu.ng',
          fullName: 'Chidi Okafor',
          phone: '2348101234567',
          verificationTier: 'tier_2',
          role: 'USER',
          isBanned: false,
          university: {
            id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
            name: 'University of Lagos',
            shortName: 'UNILAG',
          },
          createdAt: '2025-09-14T10:23:00.000Z',
          lastActiveAt: '2026-04-25T18:45:12.000Z',
        },
        message: 'User verification tier updated to tier_2',
      },
    },
  })
  async adjustTier(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: AdminAdjustTierDto,
  ) {
    return this.usersService.adminAdjustTier(userId, adminId, dto);
  }
}
