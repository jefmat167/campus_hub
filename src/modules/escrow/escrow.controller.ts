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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  TierGuard,
  TierAmountLimit,
  TierAmountLimitGuard,
} from '../../common/guards/tier.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import {
  User,
  UserRole,
  VerificationTier,
} from '../../database/entities/user.entity';
import { EscrowService } from './escrow.service';
import {
  InitiateEscrowDto,
  OpenDisputeDto,
  ResolveDisputeDto,
  SellerReadyDto,
  VerifyCodeDto,
} from './dto';

@ApiTags('Escrow')
@Controller('escrow')
@UseGuards(JwtAuthGuard, TierGuard, TierAmountLimitGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) { }

  /**
   * Initiate an escrow transaction
   * Buying limits: Tier 0 ≤₦30k, Tier 1 ≤₦60k, Tier 2 unlimited.
   * Seller has 72 hours to mark ready, otherwise auto-refund.
   */
  @Post()
  @TierAmountLimit('amount', {
    [VerificationTier.TIER_0]: 30000,
    [VerificationTier.TIER_1]: 60000,
    [VerificationTier.TIER_2]: null, // unlimited
  })
  @ApiOperation({
    summary: 'Initiate escrow',
    description:
      'Lock funds in escrow for a transaction. Buying limits: Tier 0 ≤₦30k, Tier 1 ≤₦60k, Tier 2 unlimited. Seller has 72 hours to confirm readiness.',
  })
  @ApiResponse({ status: 201, description: 'Escrow initiated successfully' })
  async initiateEscrow(
    @CurrentUser() user: User,
    @Body() dto: InitiateEscrowDto,
  ) {
    const escrow = await this.escrowService.initiateEscrow(user.id, dto);

    return {
      success: true,
      data: escrow,
      message: `Order ${escrow.orderNumber} created. Seller has 72 hours to confirm readiness.`,
    };
  }

  /**
   * Get user's escrow transactions
   */
  @Get()
  async getMyEscrows(
    @CurrentUser() user: User,
    @Query('role') role?: 'buyer' | 'seller' | 'all',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { escrows, total } = await this.escrowService.getUserEscrows(
      user.id,
      role || 'all',
      Number(page) || 1,
      Number(limit) || 20,
    );

    return {
      success: true,
      data: escrows,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Get escrow by ID
   */
  @Get(':id')
  async getEscrow(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const escrow = await this.escrowService.getEscrow(id, user.id);

    return {
      success: true,
      data: escrow,
    };
  }

  /**
   * Seller marks ready and sets delivery details
   * This starts the delivery scheduling process
   */
  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Seller marks ready',
    description:
      'Seller confirms they are ready to deliver and sets delivery details (date, time, location). Generates a 4-digit delivery code for the buyer.',
  })
  @ApiResponse({ status: 200, description: 'Delivery scheduled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status or not the seller' })
  @ApiResponse({ status: 404, description: 'Escrow not found' })
  async sellerReady(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SellerReadyDto,
  ) {
    const { escrow, deliveryCode } = await this.escrowService.sellerReady(
      id,
      user.id,
      dto,
    );

    return {
      success: true,
      data: {
        escrow,
        deliveryCode: {
          validFrom: deliveryCode.validFrom,
          validUntil: deliveryCode.validUntil,
        },
      },
      message: `Delivery scheduled for ${dto.deliveryDate} at ${dto.deliveryTime}. A delivery code has been sent to the buyer.`,
    };
  }

  /**
   * Buyer views their delivery code
   */
  @Get(':id/delivery-code')
  @ApiOperation({
    summary: 'Get delivery code',
    description:
      'Buyer retrieves their 4-digit delivery code. Code is valid within ±2 hours of scheduled delivery time.',
  })
  @ApiResponse({ status: 200, description: 'Delivery code retrieved' })
  @ApiResponse({ status: 400, description: 'Not the buyer or no code exists' })
  @ApiResponse({ status: 404, description: 'Escrow not found' })
  async getDeliveryCode(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const deliveryCode = await this.escrowService.getDeliveryCode(id, user.id);

    return {
      success: true,
      data: {
        code: deliveryCode.code,
        validFrom: deliveryCode.validFrom,
        validUntil: deliveryCode.validUntil,
        isValid: deliveryCode.isValid,
        isExpired: deliveryCode.isExpired,
        isNotYetValid: deliveryCode.isNotYetValid,
      },
    };
  }

  /**
   * Buyer requests a new delivery code (invalidates old one)
   */
  @Post(':id/resend-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resend delivery code',
    description:
      'Buyer requests a new 4-digit delivery code. The previous code is invalidated.',
  })
  @ApiResponse({ status: 200, description: 'New code generated' })
  @ApiResponse({ status: 400, description: 'Not the buyer or invalid status' })
  @ApiResponse({ status: 404, description: 'Escrow not found' })
  async resendDeliveryCode(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const deliveryCode = await this.escrowService.resendDeliveryCode(
      id,
      user.id,
    );

    return {
      success: true,
      data: {
        code: deliveryCode.code,
        validFrom: deliveryCode.validFrom,
        validUntil: deliveryCode.validUntil,
      },
      message: 'A new delivery code has been generated.',
    };
  }

  /**
   * Seller verifies delivery code at handover
   */
  @Post(':id/verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify delivery code',
    description:
      'Seller enters the 4-digit code shown by buyer to confirm delivery. Starts the 24-hour auto-release window.',
  })
  @ApiResponse({ status: 200, description: 'Delivery confirmed' })
  @ApiResponse({ status: 400, description: 'Invalid code or not the seller' })
  @ApiResponse({ status: 404, description: 'Escrow not found' })
  async verifyDeliveryCode(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VerifyCodeDto,
  ) {
    const escrow = await this.escrowService.verifyDeliveryCode(
      id,
      user.id,
      dto.code,
    );

    return {
      success: true,
      data: escrow,
      message:
        'Delivery confirmed! Funds will be released in 24 hours unless a dispute is opened.',
    };
  }

  /**
   * Cancel escrow
   * - If buyer cancels after seller is ready: cancellation fee applies
   * - Otherwise: full refund to buyer
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel escrow',
    description:
      'Cancel the escrow transaction. If buyer cancels after seller has marked ready, a cancellation fee applies (60% to seller, 40% to platform). Otherwise, full refund.',
  })
  @ApiResponse({ status: 200, description: 'Escrow cancelled' })
  @ApiResponse({ status: 400, description: 'Cannot cancel in current status' })
  @ApiResponse({ status: 404, description: 'Escrow not found' })
  async cancelEscrow(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const result = await this.escrowService.cancelEscrow(id, user.id);

    let message = 'Escrow cancelled.';
    if (result.cancellationFee && result.cancellationFee > 0) {
      message = `Escrow cancelled. A cancellation fee of ₦${result.cancellationFee.toLocaleString()} was deducted.`;
    } else {
      message = 'Escrow cancelled. Full refund has been processed.';
    }

    return {
      success: true,
      data: {
        escrow: result.escrow,
        cancellationFee: result.cancellationFee || 0,
        refundAmount: result.refundAmount,
        sellerCompensation: result.sellerCompensation || 0,
      },
      message,
    };
  }

  /**
   * Open a dispute for an escrow
   * Only available within 24 hours after delivery confirmation
   */
  @Post(':id/dispute')
  @ApiOperation({
    summary: 'Open dispute',
    description:
      'Open a dispute for the escrow. Only available within 24 hours after delivery confirmation. Opening a dispute pauses the auto-release timer.',
  })
  @ApiResponse({ status: 201, description: 'Dispute opened' })
  @ApiResponse({
    status: 400,
    description: 'Can only dispute during the 24h window after delivery',
  })
  @ApiResponse({ status: 404, description: 'Escrow not found' })
  async openDispute(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OpenDisputeDto,
  ) {
    const dispute = await this.escrowService.openDispute(id, user.id, dto);

    return {
      success: true,
      data: dispute,
      message: 'Dispute opened. Our team will review it shortly.',
    };
  }

  /**
   * Get open disputes (admin only)
   */
  @Get('admin/disputes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getOpenDisputes(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const { disputes, total } = await this.escrowService.getOpenDisputes(
      Number(page) || 1,
      Number(limit) || 20,
    );

    return {
      success: true,
      data: disputes,
      meta: {
        total,
        page: Number(page) || 1,
        limit: Number(limit) || 20,
        pages: Math.ceil(total / (Number(limit) || 20)),
      },
    };
  }

  /**
   * Get dispute details (admin only)
   */
  @Get('admin/disputes/:disputeId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getDispute(@Param('disputeId', ParseUUIDPipe) disputeId: string) {
    const dispute = await this.escrowService.getDispute(disputeId);

    return {
      success: true,
      data: dispute,
    };
  }

  /**
   * Resolve a dispute (admin only)
   */
  @Patch('admin/disputes/:disputeId/resolve')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async resolveDispute(
    @CurrentUser() user: User,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    const dispute = await this.escrowService.resolveDispute(
      disputeId,
      user.id,
      dto,
    );

    return {
      success: true,
      data: dispute,
      message: `Dispute resolved: ${dto.resolution}`,
    };
  }
}
