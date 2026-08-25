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
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudentAccountGuard } from '../../common/guards/student-account.guard';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Public } from '../../common/decorators/public.decorator';
import {
  User,
  VerificationTier,
} from '../../database/entities/user.entity';
import { EscrowService } from './escrow.service';
import {
  OpenDisputeDto,
  ResolveDisputeDto,
  SellerReadyDto,
  VerifyCodeDto,
} from './dto';
import { AdminListEscrowDto } from './dto/admin-list-escrow.dto';

@ApiTags('Escrow')
@Controller('escrow')
@UseGuards(JwtAuthGuard, StudentAccountGuard, TierGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class EscrowController {
  constructor(private readonly escrowService: EscrowService) { }

  // NOTE (rev-2 Phase 3): POST /escrow was retired — purchases go through
  // POST /checkout (cart) or POST /checkout/direct (buy-now), which split a
  // single wallet debit into one sub-order per seller. Sub-order lifecycle
  // endpoints below are unchanged.

  /**
   * Get user's escrow transactions
   */
  @Get()
  @ApiOperation({
    summary: 'Get my escrows',
    description:
      'Retrieve the authenticated user\'s escrow transactions. Filter by role (buyer, seller, or all).',
  })
  @ApiQuery({ name: 'role', required: false, enum: ['buyer', 'seller', 'all'], description: 'Filter by user role in the transaction', example: 'all' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Escrow transactions retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            orderNumber: 'ORD-2026-000142',
            amount: '25000.00',
            status: 'awaiting_seller',
            listing: { id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', title: 'iPhone 13 Pro Max' },
            buyer: { id: '550e8400-e29b-41d4-a716-446655440000', firstName: 'Chidi', lastName: 'Okafor' },
            seller: { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', firstName: 'Amina', lastName: 'Bello' },
            createdAt: '2026-03-19T14:30:00.000Z',
          },
        ],
        meta: { total: 1, page: 1, limit: 20, pages: 1 },
      },
    },
  })
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
  @ApiOperation({
    summary: 'Get escrow by ID',
    description: 'Retrieve a single escrow transaction. User must be the buyer or seller.',
  })
  @ApiResponse({
    status: 200,
    description: 'Escrow transaction retrieved',
    schema: {
      example: {
        success: true,
        data: {
          id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          orderNumber: 'ORD-2026-000142',
          buyerId: '550e8400-e29b-41d4-a716-446655440000',
          sellerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
          listingId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          amount: '25000.00',
          platformFee: null,
          sellerPayout: null,
          status: 'seller_ready',
          deliveryDate: '2026-03-21',
          deliveryTime: '14:30',
          deliveryLocation: 'Faculty of Engineering, near the main gate',
          fulfillmentExpiresAt: '2026-03-22T14:30:00.000Z',
          sellerReadyAt: '2026-03-20T10:00:00.000Z',
          createdAt: '2026-03-19T14:30:00.000Z',
          updatedAt: '2026-03-20T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Escrow not found' })
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
  @ApiResponse({
    status: 200,
    description: 'Delivery scheduled successfully',
    schema: {
      example: {
        success: true,
        data: {
          escrow: {
            id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            orderNumber: 'ORD-2026-000142',
            status: 'seller_ready',
            deliveryDate: '2026-03-21',
            deliveryTime: '14:30',
            deliveryLocation: 'Faculty of Engineering, near the main gate',
            sellerReadyAt: '2026-03-20T10:00:00.000Z',
          },
          deliveryCode: {
            validFrom: '2026-03-21T12:30:00.000Z',
            validUntil: '2026-03-21T16:30:00.000Z',
          },
        },
        message: 'Delivery scheduled for 2026-03-21 at 14:30. A delivery code has been sent to the buyer.',
      },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Delivery code retrieved',
    schema: {
      example: {
        success: true,
        data: {
          code: '4829',
          validFrom: '2026-03-21T12:30:00.000Z',
          validUntil: '2026-03-21T16:30:00.000Z',
          isValid: true,
          isExpired: false,
          isNotYetValid: false,
        },
      },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'New code generated',
    schema: {
      example: {
        success: true,
        data: {
          code: '7361',
          validFrom: '2026-03-21T12:30:00.000Z',
          validUntil: '2026-03-21T16:30:00.000Z',
        },
        message: 'A new delivery code has been generated.',
      },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Delivery confirmed',
    schema: {
      example: {
        success: true,
        data: {
          id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          orderNumber: 'ORD-2026-000142',
          status: 'delivered',
          deliveredAt: '2026-03-21T14:35:00.000Z',
          disputeWindowExpiresAt: '2026-03-22T14:35:00.000Z',
        },
        message: 'Delivery confirmed! Funds will be released in 24 hours unless a dispute is opened.',
      },
    },
  })
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
  @ApiResponse({
    status: 200,
    description: 'Escrow cancelled',
    schema: {
      example: {
        success: true,
        data: {
          escrow: {
            id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            orderNumber: 'ORD-2026-000142',
            status: 'cancelled',
          },
          cancellationFee: 2500,
          refundAmount: 22500,
          sellerCompensation: 1500,
        },
        message: 'Escrow cancelled. A cancellation fee of ₦2,500 was deducted.',
      },
    },
  })
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
  @ApiResponse({
    status: 201,
    description: 'Dispute opened',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          escrowId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          filedBy: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'item_not_as_described',
          description: 'The laptop screen has a crack that was not mentioned in the listing. The seller did not disclose this damage.',
          evidence: ['https://storage.example.com/evidence/photo1.jpg'],
          status: 'open',
          createdAt: '2026-03-21T18:00:00.000Z',
        },
        message: 'Dispute opened. Our team will review it shortly.',
      },
    },
  })
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
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.ESCROW_READ)
  @ApiOperation({
    summary: 'Get open disputes (admin)',
    description: 'Retrieve all open disputes. Requires escrow:read or escrow:manage permission.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Open disputes retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            escrowId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            filedBy: '550e8400-e29b-41d4-a716-446655440000',
            reason: 'item_not_as_described',
            status: 'open',
            createdAt: '2026-03-21T18:00:00.000Z',
          },
        ],
        meta: { total: 1, page: 1, limit: 20, pages: 1 },
      },
    },
  })
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
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.ESCROW_READ)
  @ApiOperation({
    summary: 'Get dispute details (admin)',
    description: 'Retrieve full details of a specific dispute including the escrow transaction.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dispute details retrieved',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          escrowId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          filedBy: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'item_not_as_described',
          description: 'The laptop screen has a crack that was not mentioned in the listing.',
          evidence: ['https://storage.example.com/evidence/photo1.jpg'],
          status: 'open',
          escrow: {
            id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            orderNumber: 'ORD-2026-000142',
            amount: '25000.00',
            status: 'disputed',
            buyer: { id: '550e8400-e29b-41d4-a716-446655440000', firstName: 'Chidi', lastName: 'Okafor' },
            seller: { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', firstName: 'Amina', lastName: 'Bello' },
          },
          createdAt: '2026-03-21T18:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
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
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.ESCROW_MANAGE)
  @ApiOperation({
    summary: 'Resolve dispute (admin)',
    description:
      'Resolve a dispute by refunding the buyer, releasing to the seller, or splitting funds. Requires escrow:read or escrow:manage permission.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dispute resolved',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          status: 'resolved_split',
          resolution: 'resolved_split',
          resolutionNotes: 'Item was partially damaged. Splitting funds 70-30 in favor of buyer.',
          resolvedBy: 'c3d4e5f6-a1b2-7890-abcd-ef1234567890',
          buyerRefundAmount: '17500.00',
          sellerReleaseAmount: '7500.00',
          resolvedAt: '2026-03-22T10:00:00.000Z',
        },
        message: 'Dispute resolved: resolved_split',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Dispute not found' })
  async resolveDispute(
    @CurrentAdmin() admin: any,
    @Param('disputeId', ParseUUIDPipe) disputeId: string,
    @Body() dto: ResolveDisputeDto,
  ) {
    const dispute = await this.escrowService.resolveDispute(
      disputeId,
      admin.id,
      dto,
    );

    return {
      success: true,
      data: dispute,
      message: `Dispute resolved: ${dto.resolution}`,
    };
  }

  // ─── Admin: Escrow Transactions ──────────────────────────────────

  @Get('admin/transactions')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.ESCROW_READ)
  @ApiOperation({ summary: 'List all escrow transactions (admin)', description: 'Paginated, filterable by status, buyer, seller, date, amount.' })
  @ApiResponse({
    status: 200,
    description: 'Escrow transactions retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
            orderNumber: 'ORD-2026-000318',
            buyerId: '550e8400-e29b-41d4-a716-446655440000',
            sellerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
            amount: '35000.00',
            status: 'completed',
            platformFee: '875.00',
            sellerPayout: '34125.00',
            createdAt: '2026-04-10T11:00:00.000Z',
          },
        ],
        meta: { total: 892, page: 1, limit: 20, pages: 45 },
      },
    },
  })
  async adminListEscrow(@Query() dto: AdminListEscrowDto) {
    const { escrows, total } = await this.escrowService.adminListEscrow(dto);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    return {
      success: true,
      data: escrows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }
}
