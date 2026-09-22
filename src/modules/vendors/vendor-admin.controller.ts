import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import {
  AuditAction,
  AuditTargetType,
} from '../../database/entities/admin-audit-log.entity';
import { AdminAuditService } from '../admin/admin-audit.service';
import { VendorsService } from './vendors.service';
import { RejectVendorDto, SuspendVendorDto } from './dto/vendor-decision.dto';

/**
 * Vendor verification queue — a new review type alongside the Tier-1
 * student-document queue (rev-2 spec 04.2): same admin workflow, same
 * verification permissions, new inputs (BVN/NIN identity + live shopfront
 * photo baseline; CAC for the optional Verified badge).
 */
@ApiTags('Vendors (Admin)')
@Controller('vendors/admin')
@UseGuards(AdminJwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class VendorAdminController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly auditService: AdminAuditService,
  ) { }

  @Get('pending')
  @RequirePermission(AdminPermissions.VERIFICATION_READ)
  @ApiOperation({ summary: 'Pending vendor applications (oldest first)' })
  @ApiResponse({ status: 200, description: 'Paginated pending applications' })
  async listPending(@Query('page') page?: string, @Query('limit') limit?: string) {
    const { vendors, total } = await this.vendorsService.listPending(
      Number(page) || 1,
      Number(limit) || 20,
    );
    const take = Math.min(Number(limit) || 20, 100);
    return {
      success: true,
      data: vendors,
      meta: {
        total,
        page: Number(page) || 1,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  @Get(':profileId')
  @RequirePermission(AdminPermissions.VERIFICATION_READ)
  @ApiOperation({ summary: 'Vendor profile detail (any status)' })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  async getDetail(@Param('profileId', ParseUUIDPipe) profileId: string) {
    return this.vendorsService.getAdminDetail(profileId);
  }

  @Post(':profileId/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.VERIFICATION_MANAGE)
  @ApiOperation({ summary: 'Approve a pending vendor application → active' })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  @ApiResponse({ status: 400, description: 'Profile is not pending review' })
  async approve(
    @CurrentAdmin('id') adminId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    const vendor = await this.vendorsService.approve(profileId, adminId);

    await this.auditService.log(
      adminId,
      AuditAction.VENDOR_APPROVE,
      AuditTargetType.USER,
      String(vendor['userId'] ?? profileId),
      undefined,
      { vendorProfileId: profileId },
    );

    return { success: true, data: vendor, message: 'Vendor approved' };
  }

  @Post(':profileId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.VERIFICATION_MANAGE)
  @ApiOperation({ summary: 'Reject a pending vendor application (with reason)' })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  async reject(
    @CurrentAdmin('id') adminId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: RejectVendorDto,
  ) {
    const vendor = await this.vendorsService.reject(profileId, adminId, dto.reason);

    await this.auditService.log(
      adminId,
      AuditAction.VENDOR_REJECT,
      AuditTargetType.USER,
      profileId,
      dto.reason,
      { vendorProfileId: profileId },
    );

    return { success: true, data: vendor, message: 'Vendor application rejected' };
  }

  @Post(':profileId/suspend')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.VERIFICATION_MANAGE)
  @ApiOperation({ summary: 'Suspend an active vendor (storefront frozen)' })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  async suspend(
    @CurrentAdmin('id') adminId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: SuspendVendorDto,
  ) {
    const vendor = await this.vendorsService.suspend(profileId, adminId, dto.reason);

    await this.auditService.log(
      adminId,
      AuditAction.VENDOR_SUSPEND,
      AuditTargetType.USER,
      profileId,
      dto.reason,
      { vendorProfileId: profileId },
    );

    return { success: true, data: vendor, message: 'Vendor suspended' };
  }

  @Post(':profileId/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.VERIFICATION_MANAGE)
  @ApiOperation({ summary: 'Reactivate a suspended vendor' })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  async reactivate(
    @CurrentAdmin('id') adminId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    const vendor = await this.vendorsService.reactivate(profileId, adminId);

    await this.auditService.log(
      adminId,
      AuditAction.VENDOR_REACTIVATE,
      AuditTargetType.USER,
      profileId,
      undefined,
      { vendorProfileId: profileId },
    );

    return { success: true, data: vendor, message: 'Vendor reactivated' };
  }

  @Post(':profileId/verify-cac')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AdminPermissions.VERIFICATION_MANAGE)
  @ApiOperation({ summary: 'Verify submitted CAC docs → grants the Verified badge' })
  @ApiParam({ name: 'profileId', description: 'Vendor profile UUID' })
  @ApiResponse({ status: 400, description: 'Vendor has not submitted CAC details' })
  async verifyCac(
    @CurrentAdmin('id') adminId: string,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    const vendor = await this.vendorsService.verifyCac(profileId, adminId);

    await this.auditService.log(
      adminId,
      AuditAction.VENDOR_CAC_VERIFY,
      AuditTargetType.USER,
      profileId,
      undefined,
      { vendorProfileId: profileId },
    );

    return { success: true, data: vendor, message: 'CAC verified' };
  }
}
