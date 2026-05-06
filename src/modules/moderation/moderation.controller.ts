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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { ReportStatus, ReportType } from '../../database/entities/report.entity';
import { BanAppealStatus } from '../../database/entities/ban-appeal.entity';
import { ModerationStatus } from '../../database/entities/moderation-queue.entity';
import { ModerationService } from './moderation.service';
import {
  CreateReportDto,
  ReviewReportDto,
  BanUserDto,
  CreateBanAppealDto,
  ReviewAppealDto,
  IssueWarningDto,
  ReviewQueueItemDto,
} from './dto';

@ApiTags('Moderation')
@ApiBearerAuth()
@Controller('moderation')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  // ============ USER ENDPOINTS ============

  /**
   * Report content (post, comment, listing, user, etc.)
   * Requires TIER_0 to prevent spam reports from unverified accounts
   */
  @Post('reports')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({ summary: 'Report content', description: 'Report a post, comment, listing, user, or other content. Requires TIER_0 verification to prevent spam reports from unverified accounts.' })
  @ApiResponse({
    status: 201,
    description: 'Report submitted successfully.',
    schema: {
      example: {
        success: true,
        data: { id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
        message: 'Report submitted successfully. Our team will review it.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - user does not meet TIER_0 verification requirement.' })
  async createReport(
    @CurrentUser() user: User,
    @Body() dto: CreateReportDto,
  ) {
    const report = await this.moderationService.createReport(user.id, dto);

    return {
      success: true,
      data: { id: report.id },
      message: 'Report submitted successfully. Our team will review it.',
    };
  }

  /**
   * Get user's warnings
   */
  @Get('warnings')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get my warnings', description: 'Retrieve all warnings issued to the authenticated user.' })
  @ApiResponse({
    status: 200,
    description: 'User warnings retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            reason: 'policy_violation',
            message: 'Your listing contained misleading information.',
            acknowledged: false,
            isActive: true,
            expiresAt: '2026-06-19T00:00:00.000Z',
            createdAt: '2026-03-19T10:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  async getMyWarnings(@CurrentUser() user: User) {
    const warnings = await this.moderationService.getUserWarnings(user.id);

    return {
      success: true,
      data: warnings,
    };
  }

  /**
   * Acknowledge a warning
   */
  @Post('warnings/:id/acknowledge')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Acknowledge a warning', description: 'Mark a warning as acknowledged by the authenticated user.' })
  @ApiParam({ name: 'id', description: 'Warning UUID', example: 'b2c3d4e5-f6a7-8901-bcde-f12345678901' })
  @ApiResponse({
    status: 200,
    description: 'Warning acknowledged successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          acknowledged: true,
          acknowledgedAt: '2026-03-19T15:00:00.000Z',
        },
        message: 'Warning acknowledged.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 404, description: 'Warning not found or does not belong to user.' })
  async acknowledgeWarning(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const warning = await this.moderationService.acknowledgeWarning(id, user.id);

    return {
      success: true,
      data: warning,
      message: 'Warning acknowledged.',
    };
  }

  /**
   * Check user's ban status
   */
  @Get('ban-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check ban status', description: 'Check whether the authenticated user is currently banned and retrieve ban details if applicable.' })
  @ApiResponse({
    status: 200,
    description: 'Ban status retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: { isBanned: false, banExpiresAt: null, banReason: null },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  async getBanStatus(@CurrentUser() user: User) {
    const status = await this.moderationService.checkBanStatus(user.id);

    return {
      success: true,
      data: status,
    };
  }

  /**
   * Submit a ban appeal
   */
  @Post('appeals')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Submit a ban appeal', description: 'Submit an appeal to contest a ban. Only available to banned users.' })
  @ApiResponse({
    status: 201,
    description: 'Appeal submitted successfully.',
    schema: {
      example: {
        success: true,
        data: { id: 'c3d4e5f6-a7b8-9012-cdef-123456789012' },
        message: 'Appeal submitted. Our team will review it.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  async createBanAppeal(
    @CurrentUser() user: User,
    @Body() dto: CreateBanAppealDto,
  ) {
    const appeal = await this.moderationService.createBanAppeal(user.id, dto);

    return {
      success: true,
      data: { id: appeal.id },
      message: 'Appeal submitted. Our team will review it.',
    };
  }

  /**
   * Check verified badge status and progress
   */
  @Get('verified-status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Check verified badge status', description: 'Check verified badge eligibility and progress towards verification requirements (TIER_2, 10+ transactions, 4.5+ rating).' })
  @ApiResponse({
    status: 200,
    description: 'Verified status retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          isVerified: false,
          verificationTier: 'tier_1',
          completedTransactions: 7,
          requiredTransactions: 10,
          sellerRating: 4.3,
          requiredRating: 4.5,
          progress: 70,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  async getVerifiedStatus(@CurrentUser() user: User) {
    const status = await this.moderationService.checkVerifiedStatus(user.id);

    return {
      success: true,
      data: status,
    };
  }

  // ============ ADMIN ENDPOINTS ============

  /**
   * Get all reports (admin)
   */
  @Get('admin/reports')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_READ)
  @ApiOperation({ summary: 'List all reports', description: 'Retrieve paginated list of content reports. Filterable by status and type. Requires MODERATOR role or above.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)', example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ReportStatus, description: 'Filter by report status' })
  @ApiQuery({ name: 'type', required: false, enum: ReportType, description: 'Filter by report type' })
  @ApiResponse({
    status: 200,
    description: 'Reports retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'd4e5f6a7-b8c9-0123-defg-234567890123',
            type: 'listing',
            reason: 'scam',
            status: 'pending',
            priority: 60,
            reportCount: 3,
            createdAt: '2026-03-19T09:00:00.000Z',
          },
        ],
        meta: { total: 15, page: 1, limit: 20, pages: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  async getReports(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ReportStatus,
    @Query('type') type?: ReportType,
  ) {
    const { reports, total } = await this.moderationService.getReports(
      Number(page) || 1,
      Number(limit) || 20,
      status,
      type,
    );

    return {
      success: true,
      data: reports,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Get report details (admin)
   */
  @Get('admin/reports/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_READ)
  @ApiOperation({ summary: 'Get report details', description: 'Retrieve full details of a specific report including reporter and reported user information. Requires MODERATOR role or above.' })
  @ApiParam({ name: 'id', description: 'Report UUID', example: 'd4e5f6a7-b8c9-0123-defg-234567890123' })
  @ApiResponse({
    status: 200,
    description: 'Report details retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'd4e5f6a7-b8c9-0123-defg-234567890123',
          type: 'listing',
          targetId: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'scam',
          description: 'Seller asking for payment outside the platform.',
          evidence: ['https://storage.example.com/evidence/screenshot1.jpg'],
          status: 'pending',
          priority: 60,
          reportCount: 3,
          reporter: { id: '...', fullName: 'Chidi Okafor' },
          reportedUser: { id: '...', fullName: 'Amina Bello' },
          createdAt: '2026-03-19T09:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'Report not found.' })
  async getReport(@Param('id', ParseUUIDPipe) id: string) {
    const report = await this.moderationService.getReport(id);

    return {
      success: true,
      data: report,
    };
  }

  /**
   * Review a report (admin)
   */
  @Patch('admin/reports/:id/review')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_MANAGE)
  @ApiOperation({ summary: 'Review a report', description: 'Review a report and take moderation action (e.g., issue warning, remove content, ban user). Requires MODERATOR role or above.' })
  @ApiParam({ name: 'id', description: 'Report UUID', example: 'd4e5f6a7-b8c9-0123-defg-234567890123' })
  @ApiResponse({
    status: 200,
    description: 'Report reviewed successfully.',
    schema: {
      example: {
        success: true,
        data: { id: '...', status: 'action_taken', action: 'warning_issued' },
        message: 'Report reviewed with action: warning_issued',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'Report not found.' })
  async reviewReport(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewReportDto,
  ) {
    const report = await this.moderationService.reviewReport(id, user.id, dto);

    return {
      success: true,
      data: report,
      message: `Report reviewed with action: ${dto.action}`,
    };
  }

  /**
   * Ban a user (admin)
   */
  @Post('admin/users/:userId/ban')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_MANAGE)
  @ApiOperation({ summary: 'Ban a user', description: 'Ban a user temporarily (with duration in days) or permanently. Requires ADMIN role or above.' })
  @ApiParam({ name: 'userId', description: 'User UUID to ban', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 201,
    description: 'User banned successfully.',
    schema: {
      example: {
        success: true,
        data: { id: '...', isBanned: true, banExpiresAt: '2026-04-18T00:00:00.000Z' },
        message: 'User banned for 30 days.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async banUser(
    @CurrentUser() admin: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: BanUserDto,
  ) {
    const user = await this.moderationService.banUser(userId, admin.id, dto);

    return {
      success: true,
      data: {
        id: user.id,
        isBanned: user.isBanned,
        banExpiresAt: user.banExpiresAt,
      },
      message: dto.permanent
        ? 'User permanently banned.'
        : `User banned for ${dto.durationDays} days.`,
    };
  }

  /**
   * Unban a user (admin)
   */
  @Post('admin/users/:userId/unban')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_MANAGE)
  @ApiOperation({ summary: 'Unban a user', description: 'Remove an active ban from a user. Requires ADMIN role or above.' })
  @ApiParam({ name: 'userId', description: 'User UUID to unban', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 200,
    description: 'User unbanned successfully.',
    schema: {
      example: {
        success: true,
        data: { id: '...', isBanned: false },
        message: 'User unbanned successfully.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async unbanUser(
    @CurrentUser() admin: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const user = await this.moderationService.unbanUser(userId, admin.id);

    return {
      success: true,
      data: { id: user.id, isBanned: user.isBanned },
      message: 'User unbanned successfully.',
    };
  }

  /**
   * Issue warning to user (admin)
   */
  @Post('admin/users/:userId/warn')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_MANAGE)
  @ApiOperation({ summary: 'Issue warning to user', description: 'Issue a moderation warning to a user with a reason and message. Requires MODERATOR role or above.' })
  @ApiParam({ name: 'userId', description: 'User UUID to warn', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 201,
    description: 'Warning issued successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'e5f6a7b8-c9d0-1234-efgh-345678901234',
          reason: 'policy_violation',
          message: 'Your listing contained misleading information.',
          isActive: true,
          expiresAt: '2026-06-19T00:00:00.000Z',
        },
        message: 'Warning issued successfully.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async issueWarning(
    @CurrentUser() admin: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: IssueWarningDto,
  ) {
    const warning = await this.moderationService.issueWarning(userId, admin.id, dto);

    return {
      success: true,
      data: warning,
      message: 'Warning issued successfully.',
    };
  }

  /**
   * Get user's warning count (admin)
   */
  @Get('admin/users/:userId/warnings')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_READ)
  @ApiOperation({ summary: 'Get user warnings (admin)', description: 'Retrieve all warnings for a specific user along with the active warning count. Requires MODERATOR role or above.' })
  @ApiParam({ name: 'userId', description: 'User UUID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @ApiResponse({
    status: 200,
    description: 'User warnings retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: { warnings: ['...'], activeCount: 2 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'User not found.' })
  async getUserWarnings(@Param('userId', ParseUUIDPipe) userId: string) {
    const warnings = await this.moderationService.getUserWarnings(userId);
    const count = await this.moderationService.getActiveWarningCount(userId);

    return {
      success: true,
      data: { warnings, activeCount: count },
    };
  }

  /**
   * Get ban appeals (admin)
   */
  @Get('admin/appeals')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_READ)
  @ApiOperation({ summary: 'List ban appeals', description: 'Retrieve paginated list of ban appeals. Filterable by status. Requires ADMIN role or above.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)', example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: BanAppealStatus, description: 'Filter by appeal status' })
  @ApiResponse({
    status: 200,
    description: 'Ban appeals retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'f6a7b8c9-d0e1-2345-fghi-456789012345',
            userId: '...',
            reason: 'I believe my account was banned in error.',
            status: 'pending',
            createdAt: '2026-03-19T12:00:00.000Z',
          },
        ],
        meta: { total: 3, page: 1, limit: 20, pages: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN or SUPER_ADMIN role.' })
  async getBanAppeals(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: BanAppealStatus,
  ) {
    const { appeals, total } = await this.moderationService.getBanAppeals(
      Number(page) || 1,
      Number(limit) || 20,
      status,
    );

    return {
      success: true,
      data: appeals,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Review ban appeal (admin)
   */
  @Patch('admin/appeals/:id/review')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_MANAGE)
  @ApiOperation({ summary: 'Review a ban appeal', description: 'Review and approve or reject a ban appeal. Approving will unban the user. Requires ADMIN role or above.' })
  @ApiParam({ name: 'id', description: 'Ban appeal UUID', example: 'f6a7b8c9-d0e1-2345-fghi-456789012345' })
  @ApiResponse({
    status: 200,
    description: 'Appeal reviewed successfully.',
    schema: {
      example: {
        success: true,
        data: { id: '...', status: 'rejected', reviewNotes: '...' },
        message: 'Appeal rejected.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'Appeal not found.' })
  async reviewBanAppeal(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewAppealDto,
  ) {
    const appeal = await this.moderationService.reviewBanAppeal(id, admin.id, dto);

    return {
      success: true,
      data: appeal,
      message: `Appeal ${dto.status === 'approved' ? 'approved - user unbanned' : 'rejected'}.`,
    };
  }

  /**
   * Get moderation queue (admin)
   */
  @Get('admin/queue')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_READ)
  @ApiOperation({ summary: 'Get moderation queue', description: 'Retrieve paginated list of flagged content awaiting moderation review. Filterable by status. Requires MODERATOR role or above.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)', example: 20 })
  @ApiQuery({ name: 'status', required: false, enum: ModerationStatus, description: 'Filter by moderation queue status' })
  @ApiResponse({
    status: 200,
    description: 'Moderation queue retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a7b8c9d0-e1f2-3456-ghij-567890123456',
            contentType: 'post',
            source: 'ai_flag',
            category: 'hate_speech',
            aiScore: 0.87,
            status: 'pending',
            priority: 80,
            createdAt: '2026-03-19T08:30:00.000Z',
          },
        ],
        meta: { total: 8, page: 1, limit: 20, pages: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  async getModerationQueue(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ModerationStatus,
  ) {
    const { items, total } = await this.moderationService.getModerationQueue(
      Number(page) || 1,
      Number(limit) || 20,
      status,
    );

    return {
      success: true,
      data: items,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Get queue item details (admin)
   */
  @Get('admin/queue/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_READ)
  @ApiOperation({ summary: 'Get queue item details', description: 'Retrieve full details of a specific moderation queue item including content snapshot and AI analysis. Requires MODERATOR role or above.' })
  @ApiParam({ name: 'id', description: 'Moderation queue item UUID', example: 'a7b8c9d0-e1f2-3456-ghij-567890123456' })
  @ApiResponse({
    status: 200,
    description: 'Queue item details retrieved successfully.',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a7b8c9d0-e1f2-3456-ghij-567890123456',
          contentType: 'post',
          contentId: '...',
          source: 'ai_flag',
          category: 'hate_speech',
          aiScore: 0.87,
          flaggedKeywords: ['offensive_term'],
          contentSnapshot: 'The flagged content text...',
          status: 'pending',
          priority: 80,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'Queue item not found.' })
  async getQueueItem(@Param('id', ParseUUIDPipe) id: string) {
    const item = await this.moderationService.getQueueItem(id);

    return {
      success: true,
      data: item,
    };
  }

  /**
   * Review queue item (admin)
   */
  @Patch('admin/queue/:id/review')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.MODERATION_MANAGE)
  @ApiOperation({ summary: 'Review a queue item', description: 'Review flagged content and take action (approve, reject, or remove). Requires MODERATOR role or above.' })
  @ApiParam({ name: 'id', description: 'Moderation queue item UUID', example: 'a7b8c9d0-e1f2-3456-ghij-567890123456' })
  @ApiResponse({
    status: 200,
    description: 'Queue item reviewed successfully.',
    schema: {
      example: {
        success: true,
        data: { id: '...', status: 'removed' },
        message: 'Content removed. Content removed and warning issued to user.',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - invalid or missing JWT token.' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires MODERATOR, ADMIN, or SUPER_ADMIN role.' })
  @ApiResponse({ status: 404, description: 'Queue item not found.' })
  async reviewQueueItem(
    @CurrentUser() admin: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewQueueItemDto,
  ) {
    const item = await this.moderationService.reviewQueueItem(id, admin.id, dto);

    return {
      success: true,
      data: item,
      message: `Content ${dto.status}. ${dto.actionTaken || ''}`.trim(),
    };
  }
}
