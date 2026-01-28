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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, UserRole, VerificationTier } from '../../database/entities/user.entity';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.MODERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
