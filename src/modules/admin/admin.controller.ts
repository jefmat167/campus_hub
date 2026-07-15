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
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { SuperAdminGuard } from './guards/super-admin.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { Admin } from '../../database/entities/admin.entity';
import { AdminAuditService } from './admin-audit.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminManagementService } from './admin-management.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { CreateAdminDto } from './dto/create-admin.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly auditService: AdminAuditService,
    private readonly statsService: AdminStatsService,
    private readonly adminManagementService: AdminManagementService,
  ) {}

  // ─── Audit Logs ──────────────────────────────────────────────────

  @Get('audit-logs')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({
    summary: 'Get audit logs',
    description: 'Returns paginated admin audit logs. Filterable by admin, action, target, and date range.',
  })
  @ApiResponse({ status: 200, description: 'Audit logs retrieved' })
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
  @ApiResponse({ status: 200, description: 'User stats retrieved' })
  async getUserStats() {
    return { success: true, data: await this.statsService.getUserStats() };
  }

  @Get('stats/financial')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Financial statistics' })
  @ApiResponse({ status: 200, description: 'Financial stats retrieved' })
  async getFinancialStats() {
    return { success: true, data: await this.statsService.getFinancialStats() };
  }

  @Get('stats/content')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Content statistics' })
  @ApiResponse({ status: 200, description: 'Content stats retrieved' })
  async getContentStats() {
    return { success: true, data: await this.statsService.getContentStats() };
  }

  @Get('stats/moderation')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Moderation statistics' })
  @ApiResponse({ status: 200, description: 'Moderation stats retrieved' })
  async getModerationStats() {
    return { success: true, data: await this.statsService.getModerationStats() };
  }

  @Get('stats/dashboard')
  @RequirePermission(AdminPermissions.DASHBOARD_READ)
  @ApiOperation({ summary: 'Full dashboard' })
  @ApiResponse({ status: 200, description: 'Dashboard stats retrieved' })
  async getDashboard() {
    return { success: true, data: await this.statsService.getDashboard() };
  }

  // ─── Admin Management (SUPER_ADMIN only) ──────────────────────────

  @Get('admins')
  @UseGuards(AdminJwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'List all admins', description: 'Returns all admin accounts with their permissions. SUPER_ADMIN only.' })
  @ApiResponse({ status: 200, description: 'Admin list retrieved' })
  async listAdmins() {
    const admins = await this.adminManagementService.listAdmins();
    return { success: true, data: admins };
  }

  @Get('admins/me')
  @ApiOperation({ summary: 'Get current admin info', description: 'Returns the current admin\'s profile, role, and permissions. No specific permission required.' })
  @ApiResponse({ status: 200, description: 'Admin info retrieved' })
  async getMe(@CurrentAdmin() admin: Admin) {
    const data = await this.adminManagementService.getMe(admin.id, admin.role);
    return { success: true, data };
  }

  @Get('permissions')
  @UseGuards(AdminJwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'List available permissions', description: 'Returns all grantable permission strings with descriptions. SUPER_ADMIN only.' })
  @ApiResponse({ status: 200, description: 'Permissions list retrieved' })
  async listPermissions() {
    return {
      success: true,
      data: this.adminManagementService.listAvailablePermissions(),
    };
  }

  @Post('admins')
  @UseGuards(AdminJwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Create new admin', description: 'Creates a new admin account with specified permissions. SUPER_ADMIN only.' })
  @ApiResponse({ status: 201, description: 'Admin created' })
  async createAdmin(
    @CurrentAdmin('id') granterId: string,
    @Body() dto: CreateAdminDto,
  ) {
    const admin = await this.adminManagementService.createAdmin(dto, granterId);
    return { success: true, data: admin, message: 'Admin created' };
  }

  @Patch('admins/:adminId/permissions')
  @UseGuards(AdminJwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Update admin permissions', description: 'Replaces all permissions for the specified admin. SUPER_ADMIN only.' })
  @ApiParam({ name: 'adminId', description: 'Admin UUID' })
  @ApiResponse({ status: 200, description: 'Permissions updated' })
  async updatePermissions(
    @CurrentAdmin('id') granterId: string,
    @Param('adminId', ParseUUIDPipe) adminId: string,
    @Body() dto: UpdatePermissionsDto,
  ) {
    const result = await this.adminManagementService.updatePermissions(
      adminId,
      dto.permissions,
      granterId,
    );
    return { success: true, data: result, message: 'Permissions updated' };
  }

  @Delete('admins/:adminId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Deactivate admin', description: 'Deactivates an admin account and revokes their session. SUPER_ADMIN only.' })
  @ApiParam({ name: 'adminId', description: 'Admin UUID to deactivate' })
  @ApiResponse({ status: 200, description: 'Admin deactivated' })
  async deactivateAdmin(
    @CurrentAdmin('id') granterId: string,
    @Param('adminId', ParseUUIDPipe) adminId: string,
  ) {
    await this.adminManagementService.deactivateAdmin(adminId, granterId);
    return { success: true, message: 'Admin deactivated' };
  }
}
