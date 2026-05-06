import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  Param,
  Body,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { UserRole } from '../../database/entities/user.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminManagementService } from './admin-management.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { PromoteUserDto } from './dto/promote-user.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly auditService: AdminAuditService,
    private readonly statsService: AdminStatsService,
    private readonly adminManagementService: AdminManagementService,
  ) { }

  // ─── Audit Logs ──────────────────────────────────────────────────

  @Get('audit-logs')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({
    summary: 'Get audit logs',
    description: 'Returns paginated admin audit logs. Filterable by admin, action, target, and date range.',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit logs retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            adminId: '550e8400-e29b-41d4-a716-446655440001',
            action: 'user_ban',
            targetType: 'user',
            targetId: '550e8400-e29b-41d4-a716-446655440002',
            reason: 'Repeated policy violations on marketplace',
            metadata: { previousRole: 'USER', banDuration: '7d' },
            ipAddress: '102.89.23.45',
            createdAt: '2026-04-25T14:30:00.000Z',
            admin: {
              id: '550e8400-e29b-41d4-a716-446655440001',
              fullName: 'Adebayo Ogunlesi',
              email: 'adebayo.admin@campushub.ng',
              role: 'ADMIN',
            },
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440003',
            adminId: '550e8400-e29b-41d4-a716-446655440001',
            action: 'listing_takedown',
            targetType: 'listing',
            targetId: '550e8400-e29b-41d4-a716-446655440004',
            reason: 'Prohibited item listed',
            metadata: null,
            ipAddress: '102.89.23.45',
            createdAt: '2026-04-25T12:15:00.000Z',
            admin: {
              id: '550e8400-e29b-41d4-a716-446655440001',
              fullName: 'Adebayo Ogunlesi',
              email: 'adebayo.admin@campushub.ng',
              role: 'ADMIN',
            },
          },
        ],
        meta: { total: 142, page: 1, limit: 20, pages: 8 },
      },
    },
  })
  async getAuditLogs(@Query() dto: AuditLogQueryDto) {
    const { logs, total } = await this.auditService.getLogs(dto);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    return {
      success: true,
      data: logs,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Stats Endpoints ─────────────────────────────────────────────

  @Get('stats/overview')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'User statistics' })
  @ApiResponse({
    status: 200,
    description: 'User stats retrieved',
    schema: {
      example: {
        success: true,
        data: {
          totalUsers: 12847,
          newToday: 34,
          newThisWeek: 218,
          newThisMonth: 1023,
          activeLast24h: 3421,
          activeLast7d: 8756,
          tierBreakdown: {
            NONE: 2104,
            TIER_0: 5832,
            TIER_1: 3689,
            TIER_2: 1222,
          },
          roleBreakdown: {
            USER: 12830,
            ADMIN: 12,
            SUPER_ADMIN: 2,
            MODERATOR: 3,
          },
        },
      },
    },
  })
  async getUserStats() {
    return { success: true, data: await this.statsService.getUserStats() };
  }

  @Get('stats/financial')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Financial statistics' })
  @ApiResponse({
    status: 200,
    description: 'Financial stats retrieved',
    schema: {
      example: {
        success: true,
        data: {
          totalEscrowVolume: 8745200,
          totalPlatformFees: 218630,
          totalWalletBalance: 15320450,
          totalLockedBalance: 1280000,
          withdrawals: {
            COMPLETED: { count: 1842, total: 6230400 },
            PENDING: { count: 23, total: 187500 },
            REVERSED: { count: 14, total: 52300 },
          },
        },
      },
    },
  })
  async getFinancialStats() {
    return { success: true, data: await this.statsService.getFinancialStats() };
  }

  @Get('stats/content')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Content statistics' })
  @ApiResponse({
    status: 200,
    description: 'Content stats retrieved',
    schema: {
      example: {
        success: true,
        data: {
          listings: {
            ACTIVE: 1823,
            SOLD: 4512,
            PAUSED: 87,
            DELETED: 234,
            TAKEN_DOWN: 19,
          },
          totalPosts: 34521,
          housing: {
            AVAILABLE: 312,
            PAUSED: 28,
            TAKEN: 189,
            EXPIRED: 1045,
            UNDER_REVIEW: 7,
            TAKEN_DOWN: 4,
          },
          reports: {
            PENDING: 18,
            UNDER_REVIEW: 5,
            ACTION_TAKEN: 312,
            DISMISSED: 89,
          },
          reportResolutionRate: 94.6,
        },
      },
    },
  })
  async getContentStats() {
    return { success: true, data: await this.statsService.getContentStats() };
  }

  @Get('stats/moderation')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Moderation statistics' })
  @ApiResponse({
    status: 200,
    description: 'Moderation stats retrieved',
    schema: {
      example: {
        success: true,
        data: {
          pendingReports: 23,
          activeBans: 8,
          warningsThisMonth: 41,
        },
      },
    },
  })
  async getModerationStats() {
    return { success: true, data: await this.statsService.getModerationStats() };
  }

  @Get('stats/dashboard')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Full dashboard' })
  @ApiResponse({
    status: 200,
    description: 'Dashboard stats retrieved',
    schema: {
      example: {
        success: true,
        data: {
          users: {
            totalUsers: 12847,
            newToday: 34,
            newThisWeek: 218,
            newThisMonth: 1023,
            activeLast24h: 3421,
            activeLast7d: 8756,
            tierBreakdown: {
              NONE: 2104,
              TIER_0: 5832,
              TIER_1: 3689,
              TIER_2: 1222,
            },
            roleBreakdown: {
              USER: 12830,
              ADMIN: 12,
              SUPER_ADMIN: 2,
              MODERATOR: 3,
            },
          },
          financial: {
            totalEscrowVolume: 8745200,
            totalPlatformFees: 218630,
            totalWalletBalance: 15320450,
            totalLockedBalance: 1280000,
            withdrawals: {
              COMPLETED: { count: 1842, total: 6230400 },
              PENDING: { count: 23, total: 187500 },
              REVERSED: { count: 14, total: 52300 },
            },
          },
          content: {
            listings: {
              ACTIVE: 1823,
              SOLD: 4512,
              PAUSED: 87,
              DELETED: 234,
              TAKEN_DOWN: 19,
            },
            totalPosts: 34521,
            housing: {
              AVAILABLE: 312,
              PAUSED: 28,
              TAKEN: 189,
              EXPIRED: 1045,
              UNDER_REVIEW: 7,
              TAKEN_DOWN: 4,
            },
            reports: {
              PENDING: 18,
              UNDER_REVIEW: 5,
              ACTION_TAKEN: 312,
              DISMISSED: 89,
            },
            reportResolutionRate: 94.6,
          },
          moderation: {
            pendingReports: 23,
            activeBans: 8,
            warningsThisMonth: 41,
          },
        },
      },
    },
  })
  async getDashboard() {
    return { success: true, data: await this.statsService.getDashboard() };
  }

  // ─── Admin Management ────────────────────────────────────────────

  @Get('admins')
  @RequirePermission(AdminPermissions.ADMIN_MANAGE)
  @ApiOperation({ summary: 'List all admins', description: 'Returns all admin users with their permissions and last login.' })
  @ApiResponse({
    status: 200,
    description: 'Admin list retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            fullName: 'Chinedu Okeke',
            email: 'chinedu.okeke@campushub.ng',
            phone: '+2348012345678',
            role: 'SUPER_ADMIN',
            permissions: [
              'users:read', 'users:manage', 'dashboard:read',
              'marketplace:read', 'marketplace:manage', 'wallet:read',
              'wallet:manage', 'escrow:read', 'escrow:manage',
              'housing:read', 'housing:manage', 'social:read',
              'social:manage', 'moderation:read', 'moderation:manage',
              'universities:read', 'universities:manage', 'news:read',
              'news:manage', 'verification:read', 'verification:manage',
              'admin:manage',
            ],
            lastLoginAt: '2026-04-26T08:12:00.000Z',
            lastActiveAt: '2026-04-26T09:45:00.000Z',
            createdAt: '2025-06-15T10:00:00.000Z',
            profilePhotoUrl: 'https://res.cloudinary.com/campushub/image/upload/v1/avatars/chinedu.jpg',
          },
          {
            id: '550e8400-e29b-41d4-a716-446655440001',
            fullName: 'Adebayo Ogunlesi',
            email: 'adebayo.admin@campushub.ng',
            phone: '+2348098765432',
            role: 'ADMIN',
            permissions: [
              'dashboard:read', 'users:read', 'marketplace:read',
              'marketplace:manage', 'moderation:read', 'moderation:manage',
            ],
            lastLoginAt: '2026-04-25T16:30:00.000Z',
            lastActiveAt: '2026-04-25T17:20:00.000Z',
            createdAt: '2025-09-01T14:00:00.000Z',
            profilePhotoUrl: null,
          },
        ],
      },
    },
  })
  async listAdmins() {
    const admins = await this.adminManagementService.listAdmins();
    return { success: true, data: admins };
  }

  @Get('admins/me')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Get my permissions', description: 'Returns the current admin\'s role and permissions.' })
  @ApiResponse({
    status: 200,
    description: 'Permissions retrieved',
    schema: {
      example: {
        success: true,
        data: {
          role: 'ADMIN',
          permissions: [
            'dashboard:read',
            'users:read',
            'marketplace:read',
            'marketplace:manage',
            'moderation:read',
            'moderation:manage',
          ],
        },
      },
    },
  })
  async getMyPermissions(
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: UserRole,
  ) {
    const data = await this.adminManagementService.getMyPermissions(userId, role);
    return { success: true, data };
  }

  @Get('permissions')
  @RequirePermission(AdminPermissions.ADMIN_MANAGE)
  @ApiOperation({ summary: 'List available permissions', description: 'Returns all available permission strings with descriptions.' })
  @ApiResponse({
    status: 200,
    description: 'Permissions list retrieved',
    schema: {
      example: {
        success: true,
        data: [
          { permission: 'users:read', description: 'View user list and user details' },
          { permission: 'users:manage', description: 'Change roles, force logout, adjust verification tier' },
          { permission: 'dashboard:read', description: 'View audit logs and dashboard statistics' },
          { permission: 'marketplace:read', description: 'View all marketplace listings' },
          { permission: 'marketplace:manage', description: 'Take down marketplace listings' },
          { permission: 'wallet:read', description: 'View wallet transactions and withdrawals' },
          { permission: 'wallet:manage', description: 'Manual wallet credit/debit adjustments' },
          { permission: 'escrow:read', description: 'View escrow transactions and disputes' },
          { permission: 'escrow:manage', description: 'Resolve escrow disputes' },
          { permission: 'housing:read', description: 'View reported housing listings' },
          { permission: 'housing:manage', description: 'Dismiss reports, take down housing listings' },
          { permission: 'social:read', description: 'View all posts (reveals author)' },
          { permission: 'social:manage', description: 'Hide/unhide posts, delete comments' },
          { permission: 'moderation:read', description: 'View reports, warnings, moderation queue, appeals' },
          { permission: 'moderation:manage', description: 'Review reports, ban/unban users, issue warnings, review appeals' },
          { permission: 'universities:read', description: 'View university/faculty/department details' },
          { permission: 'universities:manage', description: 'Create, update, deactivate universities/faculties/departments' },
          { permission: 'news:read', description: 'View all articles including drafts' },
          { permission: 'news:manage', description: 'Create, edit, delete, publish/unpublish articles' },
          { permission: 'verification:read', description: 'View pending verification requests' },
          { permission: 'verification:manage', description: 'Approve or reject verification requests' },
          { permission: 'admin:manage', description: 'Create admins, manage admin permissions' },
        ],
      },
    },
  })
  async listPermissions() {
    return {
      success: true,
      data: this.adminManagementService.listAvailablePermissions(),
    };
  }

  @Post('admins')
  @RequirePermission(AdminPermissions.ADMIN_MANAGE)
  @ApiOperation({ summary: 'Create new admin', description: 'Creates a new user with ADMIN role and specified permissions.' })
  @ApiResponse({
    status: 201,
    description: 'Admin created',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440005',
          email: 'funke.adeyemi@unilag.edu.ng',
          fullName: 'Funke Adeyemi',
          role: 'ADMIN',
          permissions: [
            'dashboard:read',
            'users:read',
            'verification:read',
            'verification:manage',
          ],
        },
        message: 'Admin created',
      },
    },
  })
  async createAdmin(
    @CurrentUser('id') granterId: string,
    @Body() dto: CreateAdminDto,
  ) {
    const admin = await this.adminManagementService.createAdmin(dto, granterId);
    return { success: true, data: admin, message: 'Admin created' };
  }

  @Post('admins/:userId/promote')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.ADMIN_MANAGE)
  @ApiOperation({ summary: 'Promote user to admin', description: 'Changes an existing user\'s role to ADMIN and grants permissions.' })
  @ApiParam({ name: 'userId', description: 'User UUID to promote' })
  @ApiResponse({
    status: 200,
    description: 'User promoted to admin',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440006',
          email: 'kemi.oladipo@oauife.edu.ng',
          fullName: 'Kemi Oladipo',
          role: 'ADMIN',
          permissions: [
            'dashboard:read',
            'moderation:read',
            'moderation:manage',
            'social:read',
            'social:manage',
          ],
        },
        message: 'User promoted to admin',
      },
    },
  })
  async promoteToAdmin(
    @CurrentUser('id') granterId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: PromoteUserDto,
  ) {
    const admin = await this.adminManagementService.promoteToAdmin(
      userId,
      dto.permissions,
      granterId,
    );
    return { success: true, data: admin, message: 'User promoted to admin' };
  }

  @Patch('admins/:userId/permissions')
  @RequirePermission(AdminPermissions.ADMIN_MANAGE)
  @ApiOperation({ summary: 'Update admin permissions', description: 'Replaces all permissions for the specified admin.' })
  @ApiParam({ name: 'userId', description: 'Admin UUID' })
  @ApiResponse({
    status: 200,
    description: 'Permissions updated',
    schema: {
      example: {
        success: true,
        data: {
          permissions: [
            'dashboard:read',
            'users:read',
            'users:manage',
            'marketplace:read',
            'marketplace:manage',
            'moderation:read',
            'moderation:manage',
          ],
        },
        message: 'Permissions updated',
      },
    },
  })
  async updatePermissions(
    @CurrentUser('id') granterId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    const result = await this.adminManagementService.updatePermissions(
      userId,
      dto.permissions,
      granterId,
    );
    return { success: true, data: result, message: 'Permissions updated' };
  }

  @Delete('admins/:userId/demote')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.ADMIN_MANAGE)
  @ApiOperation({ summary: 'Demote admin', description: 'Demotes admin back to regular USER and removes all permissions.' })
  @ApiParam({ name: 'userId', description: 'Admin UUID to demote' })
  @ApiResponse({
    status: 200,
    description: 'Admin demoted',
    schema: {
      example: {
        success: true,
        message: 'Admin demoted to regular user',
      },
    },
  })
  async demoteAdmin(
    @CurrentUser('id') granterId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.adminManagementService.demoteAdmin(userId, granterId);
    return { success: true, message: 'Admin demoted to regular user' };
  }
}
