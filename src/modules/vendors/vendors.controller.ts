import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
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
import { VendorsService } from './vendors.service';
import { VendorGuard } from './vendor.guard';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { SubmitVendorApplicationDto } from './dto/submit-vendor-application.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { SubmitCacDto } from './dto/submit-cac.dto';

@ApiTags('Vendors')
@Controller('vendors')
@ApiBearerAuth()
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) { }

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
