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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TierGuard, TierAmountLimit, TierAmountLimitGuard } from '../../common/guards/tier.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, UserRole, VerificationTier } from '../../database/entities/user.entity';
import { EscrowService } from './escrow.service';
import { InitiateEscrowDto, OpenDisputeDto, ResolveDisputeDto } from './dto';

@ApiTags('Escrow')
@Controller('escrow')
@UseGuards(JwtAuthGuard, TierGuard, TierAmountLimitGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) {}

  /**
   * Initiate an escrow transaction
   * Buying limits: Tier 0 ≤₦30k, Tier 1 ≤₦60k, Tier 2 unlimited.
   */
  @Post()
  @TierAmountLimit('amount', {
    [VerificationTier.TIER_0]: 30000,
    [VerificationTier.TIER_1]: 60000,
    [VerificationTier.TIER_2]: null, // unlimited
  })
  @ApiOperation({ summary: 'Initiate escrow', description: 'Lock funds in escrow for a transaction. Buying limits: Tier 0 ≤₦30k, Tier 1 ≤₦60k, Tier 2 unlimited.' })
  @ApiResponse({ status: 201, description: 'Escrow initiated successfully' })
  async initiateEscrow(
    @CurrentUser() user: User,
    @Body() dto: InitiateEscrowDto,
  ) {
    const escrow = await this.escrowService.initiateEscrow(user.id, dto);

    return {
      success: true,
      data: escrow,
      message: 'Escrow initiated successfully. Funds have been locked.',
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
   * Buyer confirms receipt of item
   */
  @Post(':id/confirm-receipt')
  @HttpCode(HttpStatus.OK)
  async confirmReceipt(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const escrow = await this.escrowService.buyerConfirmReceipt(id, user.id);

    return {
      success: true,
      data: escrow,
      message: 'Receipt confirmed. Awaiting seller confirmation.',
    };
  }

  /**
   * Seller confirms delivery
   */
  @Post(':id/confirm-delivery')
  @HttpCode(HttpStatus.OK)
  async confirmDelivery(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const escrow = await this.escrowService.sellerConfirmDelivery(id, user.id);

    const message = escrow.status === 'completed'
      ? 'Delivery confirmed. Funds have been released to you.'
      : 'Delivery confirmed. Awaiting buyer confirmation.';

    return {
      success: true,
      data: escrow,
      message,
    };
  }

  /**
   * Buyer releases escrow funds to seller
   */
  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  async releaseEscrow(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const escrow = await this.escrowService.releaseEscrow(id, user.id);

    return {
      success: true,
      data: escrow,
      message: 'Funds released to seller successfully.',
    };
  }

  /**
   * Cancel escrow and refund buyer
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelEscrow(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const escrow = await this.escrowService.cancelEscrow(id, user.id);

    return {
      success: true,
      data: escrow,
      message: 'Escrow cancelled. Funds have been refunded.',
    };
  }

  /**
   * Open a dispute for an escrow
   */
  @Post(':id/dispute')
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
