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
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import {
  User,
  VerificationTier,
} from '../../database/entities/user.entity';
import { AdminPermissions } from '../../common/constants/permissions';
import { HousingStatus } from '../../database/entities/housing.entity';
import { HousingService } from './housing.service';
import { CreateHousingDto, SearchHousingDto, ReportListingDto } from './dto';

@ApiTags('Housing')
@Controller('housing')
@ApiBearerAuth()
export class HousingController {
  constructor(private readonly housingService: HousingService) {}

  // ---------- Moderator / admin routes (declared before :id routes) ----------

  @Get('admin/reports')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.HOUSING_READ)
  @ApiOperation({
    summary: 'List housing listings currently under review',
    description:
      'Returns listings that have hit the report threshold and are awaiting moderator action, along with all their reports.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reported listings retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '550e8400-e29b-41d4-a716-446655440000',
            title: '2 Bedroom Flat near UNILAG Main Gate',
            status: 'under_review',
            posterId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            posterRelationship: 'CURRENT_TENANT',
            price: 450000,
            paymentFrequency: 'yearly',
            area: 'Akoka',
            reportCount: 3,
            createdAt: '2026-04-05T12:00:00.000Z',
            reports: [
              {
                id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
                reporterId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
                reason: 'FAKE_LISTING',
                details: 'This apartment does not exist at the listed address.',
                createdAt: '2026-04-12T09:30:00.000Z',
              },
              {
                id: 'c3d4e5f6-a1b2-7890-abcd-ef1234567891',
                reporterId: 'd4e5f6a1-b2c3-7890-abcd-ef1234567892',
                reason: 'ALREADY_TAKEN',
                details: 'I visited and the current tenant said someone already moved in.',
                createdAt: '2026-04-13T15:20:00.000Z',
              },
              {
                id: 'd5e6f7a2-b3c4-8901-cdef-a12345678903',
                reporterId: 'e6f7a1b2-c3d4-8901-cdef-a12345678904',
                reason: 'MISLEADING',
                details: null,
                createdAt: '2026-04-14T08:10:00.000Z',
              },
            ],
          },
        ],
        meta: { total: 5, page: 1, limit: 20, pages: 1 },
      },
    },
  })
  async getReportedListings(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { listings, total } = await this.housingService.getReportedListings(
      Number(page) || 1,
      Number(limit) || 20,
    );
    return {
      success: true,
      data: listings,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  @Post('admin/:id/dismiss-reports')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.HOUSING_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Dismiss reports on a listing',
    description:
      'Clears all reports on a listing and returns it to AVAILABLE status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Reports dismissed',
    schema: {
      example: {
        success: true,
        data: {
          id: '550e8400-e29b-41d4-a716-446655440000',
          title: '2 Bedroom Flat near UNILAG Main Gate',
          status: 'available',
          reportCount: 0,
          updatedAt: '2026-04-15T10:00:00.000Z',
        },
        message: 'Reports dismissed',
      },
    },
  })
  async dismissReports(@Param('id', ParseUUIDPipe) id: string) {
    const listing = await this.housingService.dismissReports(id);
    return { success: true, data: listing, message: 'Reports dismissed' };
  }

  @Post('admin/:id/take-down')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.HOUSING_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Take down a listing (moderator)',
    description: 'Soft-deletes a reported listing after moderator review.',
  })
  @ApiResponse({
    status: 200,
    description: 'Listing taken down',
    schema: {
      example: {
        success: true,
        message: 'Listing taken down',
      },
    },
  })
  async takeDownListing(@Param('id', ParseUUIDPipe) id: string) {
    await this.housingService.takeDownListing(id);
    return { success: true, message: 'Listing taken down' };
  }

  // ---------- Public / user routes ----------

  @Post()
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({
    summary: 'Create a new housing listing',
    description:
      'Creates a housing listing for peer-to-peer discovery. This is a listings board only — the platform never brokers payments or shares landlord contact details. Max 3 active (available + paused) listings per user. Listings auto-expire after 30 days; use /renew to extend. Requires TIER_0.',
  })
  @ApiResponse({ status: 201, description: 'Housing listing created successfully' })
  @ApiResponse({ status: 400, description: 'Active listing cap reached or invalid input' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'TIER_0 verification required' })
  async createListing(@CurrentUser() user: User, @Body() dto: CreateHousingDto) {
    const listing = await this.housingService.createListing(
      user.id,
      user.universityId,
      dto,
    );
    return {
      success: true,
      data: listing,
      message: 'Housing listing created successfully',
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({
    summary: 'Search housing listings',
    description:
      'Search and filter available housing listings within your university. Only AVAILABLE listings are returned. Requires TIER_0.',
  })
  async searchListings(
    @CurrentUser() user: User,
    @Query() dto: SearchHousingDto,
  ) {
    const { listings, total } = await this.housingService.searchListings(
      user.universityId,
      dto,
    );
    return {
      success: true,
      data: listings,
      meta: {
        total,
        page: dto.page || 1,
        limit: dto.limit || 20,
        pages: Math.ceil(total / (dto.limit || 20)),
      },
    };
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({
    summary: 'Get my housing listings',
    description:
      'Returns all of your listings across all statuses (available, taken, paused, under_review, expired). Requires TIER_0.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMyListings(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { listings, total } = await this.housingService.getMyListings(
      user.id,
      Number(page) || 1,
      Number(limit) || 20,
    );
    return {
      success: true,
      data: listings,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({
    summary: 'Get a single housing listing',
    description:
      'Returns a listing. Owners can see their own listing regardless of status; others only see AVAILABLE listings. Requires TIER_0.',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  @ApiResponse({ status: 404, description: 'Housing listing not found' })
  async getListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.getListing(id, user.id);
    return { success: true, data: listing };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({
    summary: 'Update a housing listing',
    description: 'Owner-only update. Partial fields accepted. Requires TIER_0.',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  async updateListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<CreateHousingDto>,
  ) {
    const listing = await this.housingService.updateListing(id, user.id, dto);
    return {
      success: true,
      data: listing,
      message: 'Listing updated successfully',
    };
  }

  @Patch(':id/mark-taken')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark listing as taken',
    description:
      'Self-reported by the poster once someone has secured the apartment. Listing is removed from search. Requires TIER_0.',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  async markAsTaken(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.updateStatus(
      id,
      user.id,
      HousingStatus.TAKEN,
    );
    return { success: true, data: listing, message: 'Listing marked as taken' };
  }

  @Patch(':id/pause')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause a housing listing',
    description:
      'Temporarily hides the listing from search. Paused listings still count toward the 3 active listings cap. Requires TIER_0.',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  async pauseListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.updateStatus(
      id,
      user.id,
      HousingStatus.PAUSED,
    );
    return { success: true, data: listing, message: 'Listing paused' };
  }

  @Patch(':id/reactivate')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reactivate a housing listing',
    description:
      'Returns a paused or taken listing to AVAILABLE. Cannot exceed the 3 active listings cap. Requires TIER_0.',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  async reactivateListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.updateStatus(
      id,
      user.id,
      HousingStatus.AVAILABLE,
    );
    return { success: true, data: listing, message: 'Listing reactivated' };
  }

  @Patch(':id/renew')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Renew a housing listing',
    description:
      'Extends the listing by 30 days. Works on AVAILABLE listings or EXPIRED ones (which are flipped back to AVAILABLE, subject to the active listings cap).',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  async renewListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const listing = await this.housingService.renewListing(id, user.id);
    return { success: true, data: listing, message: 'Listing renewed' };
  }

  @Post(':id/report')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Report a housing listing',
    description:
      'Flag a listing as fake, misleading, or otherwise problematic. After 3 reports the listing is automatically flipped to UNDER_REVIEW and hidden from search. Requires TIER_0.',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  async reportListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportListingDto,
  ) {
    const result = await this.housingService.reportListing(
      id,
      user.id,
      dto.reason,
      dto.details,
    );
    return {
      success: true,
      data: result,
      message: result.underReview
        ? 'Report received. The listing has been hidden pending moderator review.'
        : 'Report received. Thank you for helping keep the board clean.',
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a housing listing',
    description:
      'Soft-deletes a listing. Cannot be undone. Requires TIER_0.',
  })
  @ApiParam({ name: 'id', description: 'Housing listing UUID' })
  async deleteListing(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.housingService.deleteListing(id, user.id);
    return { success: true, message: 'Listing deleted' };
  }
}
