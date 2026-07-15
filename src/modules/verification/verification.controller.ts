import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { YouVerifyService } from './youverify.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { SubmitTier1DocumentsDto } from './dto/submit-tier1-documents.dto';
import { VerifyBvnDto, VerifyNinDto, AddSecondKycDto } from './dto/verify-kyc.dto';
import { RejectVerificationDto } from './dto/admin-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { VerificationTier } from '../../database/entities/user.entity';
import { KycType } from '../../database/entities/kyc-verification.entity';

@ApiTags('Verification')
@Controller('verification')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class VerificationController {
  constructor(
    private readonly verificationService: VerificationService,
    private readonly youVerifyService: YouVerifyService,
  ) {}

  // ============ Tier 1 Endpoints ============

  @Post('tier1/documents')
  @UseGuards(TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiOperation({
    summary: 'Submit documents for Tier 1 verification',
    description:
      'Submit student ID (front/back) and school fees receipt for verification. Optionally include a school email which must be verified before admin can approve.',
  })
  @ApiResponse({
    status: 201,
    description: 'Documents submitted successfully',
    schema: {
      example: {
        message:
          'Documents submitted. Please verify your school email, then your documents will be reviewed.',
        documents: [
          {
            id: 'uuid',
            type: 'STUDENT_ID_FRONT',
            status: 'PENDING',
            documentUrl: 'https://...',
          },
        ],
        schoolEmailVerificationSent: true,
        submissionAttempt: 1,
        remainingAttempts: 2,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Maximum submission attempts reached or already verified',
  })
  @ApiResponse({
    status: 403,
    description: 'Must be at least Tier 0 to submit documents',
  })
  async submitTier1Documents(
    @CurrentUser('id') userId: string,
    @Body() dto: SubmitTier1DocumentsDto,
  ) {
    return this.verificationService.submitTier1Documents(userId, dto);
  }

  @Get('tier1/status')
  @ApiOperation({
    summary: 'Get Tier 1 verification status',
    description: 'Returns current Tier 1 verification status, documents, and school email status.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tier 1 verification status',
    schema: {
      example: {
        status: 'PENDING_REVIEW',
        verificationTier: 'tier_0',
        documents: [],
        schoolEmail: 'john.doe@students.unilag.edu.ng',
        schoolEmailVerified: false,
        submissionAttempt: 1,
        remainingAttempts: 2,
        rejectionReason: null,
      },
    },
  })
  async getTier1Status(@CurrentUser('id') userId: string) {
    return this.verificationService.getTier1Status(userId);
  }

  @Post('tier1/resend-school-email')
  @ApiOperation({
    summary: 'Resend school email verification',
    description: 'Resends the verification email to the school email address (max 3 attempts).',
  })
  @ApiResponse({
    status: 200,
    description: 'Email resent or already verified',
    schema: {
      example: {
        sent: true,
        message: 'Verification email sent',
        remainingAttempts: 2,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'No school email on file or max resend attempts reached',
  })
  async resendSchoolEmailVerification(@CurrentUser('id') userId: string) {
    return this.verificationService.resendSchoolEmailVerification(userId);
  }

  // ============ Tier 2 (KYC) Endpoints ============

  @Post('kyc/bvn')
  @UseGuards(TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Verify BVN for Tier 2',
    description:
      'Verify Bank Verification Number (BVN) to upgrade to Tier 2. Charges ₦100 from wallet on success.',
  })
  @ApiResponse({
    status: 201,
    description: 'BVN verification result',
    schema: {
      example: {
        success: true,
        message: 'BVN verified successfully! You are now Tier 2 verified.',
        verificationId: 'uuid',
        verifiedAt: '2024-01-15T10:00:00Z',
        tier2Achieved: true,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid BVN, insufficient balance, or max attempts reached',
  })
  async verifyBvn(@CurrentUser('id') userId: string, @Body() dto: VerifyBvnDto) {
    return this.youVerifyService.verifyBvn(userId, dto.bvn);
  }

  @Post('kyc/nin')
  @UseGuards(TierGuard)
  @MinTier(VerificationTier.TIER_1)
  @ApiOperation({
    summary: 'Verify NIN for Tier 2',
    description:
      'Verify National Identification Number (NIN) to upgrade to Tier 2. Charges ₦100 from wallet on success.',
  })
  @ApiResponse({
    status: 201,
    description: 'NIN verification result',
    schema: {
      example: {
        success: true,
        message: 'NIN verified successfully! You are now Tier 2 verified.',
        verificationId: 'uuid',
        verifiedAt: '2024-01-15T10:00:00Z',
        tier2Achieved: true,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid NIN, insufficient balance, or max attempts reached',
  })
  async verifyNin(@CurrentUser('id') userId: string, @Body() dto: VerifyNinDto) {
    return this.youVerifyService.verifyNin(userId, dto.nin);
  }

  @Post('kyc/add')
  @UseGuards(TierGuard)
  @MinTier(VerificationTier.TIER_2)
  @ApiOperation({
    summary: 'Add second KYC type (free)',
    description:
      'For Tier 2 users who want to add a second verification type (BVN or NIN) to get the high trust badge. This is free.',
  })
  @ApiResponse({
    status: 201,
    description: 'Second KYC type verification result',
    schema: {
      example: {
        success: true,
        message: 'NIN verified successfully! You now have the high trust badge.',
        verificationId: 'uuid',
        verifiedAt: '2024-01-15T10:00:00Z',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Must be Tier 2 or type already verified',
  })
  async addSecondKycType(@CurrentUser('id') userId: string, @Body() dto: AddSecondKycDto) {
    return this.youVerifyService.addSecondKycType(userId, dto.type, dto.value);
  }

  @Get('kyc/status')
  @ApiOperation({
    summary: 'Get KYC verification status',
    description: 'Returns current KYC status including BVN/NIN verification state and attempt count.',
  })
  @ApiResponse({
    status: 200,
    description: 'KYC verification status',
    schema: {
      example: {
        tier: 'tier_1',
        bvnVerified: false,
        ninVerified: false,
        hasHighTrustBadge: false,
        attemptCount: 0,
        remainingAttempts: 3,
        canRetry: true,
        recentVerifications: [],
      },
    },
  })
  async getKycStatus(@CurrentUser('id') userId: string) {
    return this.youVerifyService.getKycStatus(userId);
  }

  // ============ Admin Endpoints ============

  @Get('admin/pending')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.VERIFICATION_READ)
  @ApiOperation({
    summary: 'Get pending Tier 1 verifications (Admin)',
    description:
      'Returns list of users pending Tier 1 verification review. Only shows users whose school email (if provided) has been verified.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'List of pending verifications',
    schema: {
      example: {
        users: [
          {
            id: 'uuid',
            fullName: 'John Doe',
            email: 'john@example.com',
            schoolEmail: 'john.doe@students.unilag.edu.ng',
            schoolEmailVerified: true,
            documents: [],
          },
        ],
        total: 1,
      },
    },
  })
  async getPendingVerifications(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.verificationService.getPendingVerifications(page, limit);
  }

  @Get('admin/:userId')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.VERIFICATION_READ)
  @ApiOperation({
    summary: 'Get verification details for a user (Admin)',
    description: 'Returns full verification details including documents and school email status.',
  })
  @ApiParam({ name: 'userId', type: String, description: 'User ID' })
  @ApiResponse({
    status: 200,
    description: 'User verification details',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async getVerificationDetails(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.verificationService.getVerificationDetails(userId);
  }

  @Post('admin/:userId/approve')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.VERIFICATION_MANAGE)
  @ApiOperation({
    summary: 'Approve Tier 1 verification (Admin)',
    description:
      'Approves user documents and upgrades them to Tier 1. School email must be verified if provided.',
  })
  @ApiParam({ name: 'userId', type: String, description: 'User ID to approve' })
  @ApiResponse({
    status: 200,
    description: 'Verification approved, user upgraded to Tier 1',
  })
  @ApiResponse({
    status: 400,
    description: 'User not pending review or school email not verified',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async approveVerification(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentAdmin('id') adminId: string,
  ) {
    return this.verificationService.approveVerification(userId, adminId);
  }

  @Post('admin/:userId/reject')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.VERIFICATION_MANAGE)
  @ApiOperation({
    summary: 'Reject Tier 1 verification (Admin)',
    description: 'Rejects user documents with a reason. User can resubmit up to max attempts.',
  })
  @ApiParam({ name: 'userId', type: String, description: 'User ID to reject' })
  @ApiResponse({
    status: 200,
    description: 'Verification rejected',
  })
  @ApiResponse({
    status: 400,
    description: 'User not pending review',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  async rejectVerification(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentAdmin('id') adminId: string,
    @Body() dto: RejectVerificationDto,
  ) {
    return this.verificationService.rejectVerification(userId, adminId, dto.reason);
  }

  // ============ Legacy Endpoints (for backwards compatibility) ============

  /**
   * @deprecated Use POST /verification/tier1/documents instead
   */
  @Post('documents')
  @ApiOperation({
    summary: 'Upload a verification document (Legacy)',
    deprecated: true,
  })
  @ApiResponse({
    status: 201,
    description: 'Document uploaded successfully',
  })
  async uploadDocument(@CurrentUser('id') userId: string, @Body() dto: UploadDocumentDto) {
    return this.verificationService.uploadDocument(userId, dto);
  }

  @Get('documents')
  @ApiOperation({ summary: 'Get all documents for current user' })
  @ApiResponse({
    status: 200,
    description: 'List of verification documents',
  })
  async getDocuments(@CurrentUser('id') userId: string) {
    return this.verificationService.getUserDocuments(userId);
  }

  /**
   * @deprecated Use GET /verification/tier1/status instead
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get verification status for current user (Legacy)',
    deprecated: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Current verification status',
  })
  async getStatus(@CurrentUser('id') userId: string) {
    return this.verificationService.getVerificationStatus(userId);
  }
}
