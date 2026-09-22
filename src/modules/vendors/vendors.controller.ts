import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import {
  EscrowStatus,
  OrderMarket,
} from '../../database/entities/escrow.entity';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';
import { VendorsService } from './vendors.service';
import { VendorDeliveryService } from './vendor-delivery.service';
import { EscrowService } from '../escrow/escrow.service';
import { VendorGuard } from './vendor.guard';
import { CurrentVendor } from './current-vendor.decorator';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { SubmitVendorApplicationDto } from './dto/submit-vendor-application.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { SubmitCacDto } from './dto/submit-cac.dto';
import { ReplaceVendorDeliveryDto } from './dto/vendor-delivery.dto';

@ApiTags('Vendors')
@Controller('vendors')
@ApiBearerAuth()
export class VendorsController {
  constructor(
    private readonly vendorsService: VendorsService,
    private readonly vendorDeliveryService: VendorDeliveryService,
    private readonly escrowService: EscrowService,
  ) { }

  @Get('me/orders')
  @UseGuards(JwtAuthGuard, VendorGuard)
  @ApiOperation({
    summary: 'My vendor orders (sub-orders where I am the seller)',
    description:
      'Vendor-market sub-orders only. Lifecycle actions (confirm/reject, ready, ' +
      'verify-code, cancel) live on /escrow/:id/* — that surface is party-scoped.',
  })
  @ApiResponse({ status: 200, description: 'Paginated vendor orders' })
  async myOrders(
    @CurrentUser() user: User,
    @Query('status') status?: EscrowStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const { escrows, total } = await this.escrowService.getUserEscrows(
      user.id,
      'seller',
      Number(page) || 1,
      take,
      OrderMarket.VENDOR,
      status,
    );
    return {
      success: true,
      data: escrows,
      meta: {
        total,
        page: Number(page) || 1,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  @Post('apply')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_2)
  @ApiOperation({
    summary: 'Apply for the vendor role (Door 1 — existing Tier-2 student)',
    description:
      'Attaches a vendor profile to the current student account (same login, same wallet). ' +
      'Requires TIER_2 — vendor status is an upgrade on the strongest identity check the ' +
      'platform already does. The application (with live shopfront photo) goes straight to ' +
      'the admin review queue.',
  })
  @ApiResponse({ status: 201, description: 'Application submitted (pending_review)' })
  @ApiResponse({ status: 409, description: 'Account already has a vendor profile' })
  @ApiResponse({ status: 400, description: 'Invalid university selection' })
  async apply(@CurrentUser() user: User, @Body() dto: ApplyVendorDto) {
    return this.vendorsService.applyAsStudent(user.id, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard, VendorGuard)
  @ApiOperation({ summary: "Current account's vendor profile (any status)" })
  @ApiResponse({ status: 200, description: 'Vendor profile' })
  @ApiResponse({ status: 403, description: 'No vendor profile on this account' })
  async getMe(@CurrentUser() user: User) {
    return this.vendorsService.getMyVendor(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, VendorGuard)
  @ApiOperation({
    summary: 'Update vendor profile (name, description, served universities)',
    description:
      'Served-universities changes re-validate the invariants: 1–3 distinct active ' +
      'universities, home ∈ served. Suspended profiles are frozen.',
  })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateVendorProfileDto) {
    return this.vendorsService.updateMyProfile(user.id, dto);
  }

  @Get('me/delivery')
  @UseGuards(JwtAuthGuard, VendorGuard)
  @ApiOperation({
    summary: 'My delivery preset — one entry per served campus',
    description:
      'Vendor-level delivery settings inherited by every listing (2026-09-21 amendment to spec 03.2): ' +
      'per served campus the door-delivery fee (home campus only), the service travel fee, and the ' +
      'admin drop points you deliver goods to with a fee each. Each entry also lists the ACTIVE admin ' +
      'drop points available at that campus (`availableDropPoints`) so a settings screen needs one request. ' +
      'A chosen point with `isActive: false` was retired by admins — drop it and save again.',
  })
  @ApiResponse({ status: 200, description: 'Delivery preset per served campus' })
  async getMyDelivery(@CurrentVendor() profile: VendorProfile) {
    return this.vendorDeliveryService.getOwn(profile);
  }

  @Put('me/delivery')
  @UseGuards(JwtAuthGuard, VendorGuard)
  @ApiOperation({
    summary: 'Replace my delivery preset wholesale',
    description:
      'Body `{ universities: [{ universityId, doorDeliveryFee?, serviceTravelFee?, dropPoints: [{ dropPointId, fee }] }] }` ' +
      '(⊆ served universities, no duplicates). A served campus left out becomes pickup-only. Door delivery is ' +
      'HOME campus only; every drop point must be an ACTIVE admin point at that campus, ≤ 3 per campus. ' +
      'Fees are naira (0 = free); null/omitted = not offered. Listings inherit this — a listing only opts ' +
      'out via its own `pickupOnly`. Suspended profiles are frozen.',
  })
  @ApiResponse({ status: 200, description: 'Updated delivery preset' })
  @ApiResponse({ status: 400, description: 'Unserved campus, door fee off-home, foreign/inactive drop point, or > 3 points' })
  async replaceMyDelivery(
    @CurrentVendor() profile: VendorProfile,
    @Body() dto: ReplaceVendorDeliveryDto,
  ) {
    return this.vendorDeliveryService.replace(profile, dto);
  }

  @Post('me/submit')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, VendorGuard)
  @ApiOperation({
    summary: 'Submit (or resubmit) the application for admin review',
    description:
      'draft | rejected → pending_review, attaching the live-captured shopfront photo. ' +
      'Door-2 accounts register first, then upload the photo and complete the application here.',
  })
  @ApiResponse({ status: 200, description: 'Submitted for review' })
  @ApiResponse({ status: 400, description: 'Profile is not in a submittable status' })
  async submit(
    @CurrentUser() user: User,
    @Body() dto: SubmitVendorApplicationDto,
  ) {
    return this.vendorsService.submitForReview(user.id, dto);
  }

  @Post('me/cac')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, VendorGuard)
  @ApiOperation({
    summary: 'Submit CAC registration for the optional Verified badge',
    description:
      'Stores the CAC number + certificate for admin verification. Resubmitting resets any ' +
      'previously granted badge until an admin re-verifies.',
  })
  @ApiResponse({ status: 200, description: 'CAC details stored, pending admin verification' })
  async submitCac(@CurrentUser() user: User, @Body() dto: SubmitCacDto) {
    return this.vendorsService.submitCac(user.id, dto);
  }
}
