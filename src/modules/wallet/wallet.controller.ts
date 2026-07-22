import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  ParseUUIDPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { VelocityService } from './velocity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { AdminPermissions } from '../../common/constants/permissions';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { VerificationTier } from '../../database/entities/user.entity';
import { AdminAuditService } from '../admin/admin-audit.service';
import { AuditAction, AuditTargetType } from '../../database/entities/admin-audit-log.entity';
import { AdminListTransactionsDto } from './dto/admin-list-transactions.dto';
import { AdminWalletAdjustmentDto } from './dto/admin-wallet-adjustment.dto';
import { UpdateTransactionCapDto } from './dto/update-transaction-cap.dto';

@ApiTags('Wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard, TierGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly velocityService: VelocityService,
    private readonly auditService: AdminAuditService,
  ) {}

  @Get('balance')
  @ApiOperation({ summary: 'Get wallet balance' })
  @ApiResponse({
    status: 200,
    description: 'Current wallet balance',
    schema: {
      example: {
        balance: 25000,
        lockedBalance: 5000,
        availableBalance: 20000,
      },
    },
  })
  async getBalance(@CurrentUser('id') userId: string) {
    return this.walletService.getBalance(userId);
  }

  @Get('transactions')
  @ApiOperation({ summary: 'Get transaction history' })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page (max 50)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated transaction history',
    schema: {
      example: {
        data: [
          {
            id: 'uuid',
            type: 'DEPOSIT',
            amount: 5000,
            balanceAfter: 25000,
            reference: 'FUND_123456',
            createdAt: '2024-01-15T10:00:00Z',
          },
        ],
        meta: { total: 50, page: 1, limit: 20 },
      },
    },
  })
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.walletService.getTransactions(userId, page, Math.min(limit, 50));
  }

  @Get('transactions/:id')
  @ApiOperation({ summary: 'Get transaction by ID' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({
    status: 200,
    description: 'Transaction details',
    schema: {
      example: {
        id: 'uuid',
        type: 'DEPOSIT',
        amount: 5000,
        status: 'COMPLETED',
        reference: 'FUND_123456',
        externalReference: 'PAY_abc123',
        balanceBefore: 20000,
        balanceAfter: 25000,
        metadata: null,
        createdAt: '2024-01-15T10:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async getTransactionById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) transactionId: string,
  ) {
    return this.walletService.getTransactionById(userId, transactionId);
  }

  @Get()
  @ApiOperation({ summary: 'Get wallet details including bank account' })
  @ApiResponse({
    status: 200,
    description: 'Wallet details',
    schema: {
      example: {
        id: 'uuid',
        balance: 25000,
        lockedBalance: 5000,
        availableBalance: 20000,
        isLocked: false,
        hasBankAccount: true,
        bankName: 'GTBank',
        bankAccountName: 'JOHN DOE',
        bankAccountNumber: '****6789',
      },
    },
  })
  async getWallet(@CurrentUser('id') userId: string) {
    const wallet = await this.walletService.getWallet(userId);

    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      lockedBalance: Number(wallet.lockedBalance),
      availableBalance: wallet.availableBalance,
      isLocked: wallet.isLocked,
      hasBankAccount: !!wallet.bankAccountNumber,
      bankName: wallet.bankName,
      bankAccountName: wallet.bankAccountName,
      // Mask account number for security
      bankAccountNumber: wallet.bankAccountNumber
        ? `****${wallet.bankAccountNumber.slice(-4)}`
        : null,
    };
  }

  // ─── Admin Endpoints ────────────────────────────────────────────

  @Get('admin/transactions')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.WALLET_READ)
  @ApiOperation({ summary: 'List all wallet transactions (admin)', description: 'Paginated, filterable by type, status, user, date, amount.' })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            type: 'DEPOSIT',
            amount: 15000,
            status: 'COMPLETED',
            reference: 'TXN_1714123456_a1b2c3d4',
            user: {
              id: '550e8400-e29b-41d4-a716-446655440000',
              fullName: 'Chidinma Eze',
            },
            balanceBefore: 30000,
            balanceAfter: 45000,
            createdAt: '2026-04-20T08:30:00.000Z',
          },
        ],
        meta: { total: 1520, page: 1, limit: 20, pages: 76 },
      },
    },
  })
  async adminListTransactions(@Query() dto: AdminListTransactionsDto) {
    const { transactions, total } = await this.walletService.adminListTransactions(dto);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    return {
      success: true,
      data: transactions,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  @Get('admin/withdrawals')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.WALLET_READ)
  @ApiOperation({ summary: 'List withdrawals (admin)', description: 'Filterable by status, date range.' })
  @ApiResponse({
    status: 200,
    description: 'Withdrawals retrieved',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
            type: 'WITHDRAWAL',
            amount: -25000,
            status: 'COMPLETED',
            reference: 'TXN_1714200000_b2c3d4e5',
            user: {
              id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              fullName: 'Abiodun Salami',
            },
            balanceBefore: 75000,
            balanceAfter: 50000,
            createdAt: '2026-04-22T14:45:00.000Z',
          },
        ],
        meta: { total: 340, page: 1, limit: 20, pages: 17 },
      },
    },
  })
  async adminListWithdrawals(@Query() dto: AdminListTransactionsDto) {
    const { transactions, total } = await this.walletService.adminListWithdrawals(dto);
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    return {
      success: true,
      data: transactions,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  @Post('admin/adjust')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.WALLET_MANAGE)
  @ApiOperation({ summary: 'Manual wallet adjustment (admin)', description: 'Credit or debit a user\'s wallet with reason. Requires wallet:manage permission.' })
  @ApiResponse({
    status: 200,
    description: 'Adjustment applied',
    schema: {
      example: {
        success: true,
        data: {
          id: 'c3d4e5f6-a1b2-7890-abcd-ef1234567890',
          type: 'DEPOSIT',
          amount: 5000,
          status: 'COMPLETED',
          reference: 'TXN_1714300000_c3d4e5f6',
          balanceBefore: 50000,
          balanceAfter: 55000,
          metadata: { reason: 'Refund for failed Paystack transfer on 2026-04-20', adjustedBy: 'admin' },
          createdAt: '2026-04-23T09:00:00.000Z',
        },
        message: 'Wallet credit applied',
      },
    },
  })
  async adminWalletAdjustment(
    @CurrentAdmin('id') adminId: string,
    @Body() dto: AdminWalletAdjustmentDto,
  ) {
    const transaction = await this.walletService.adminWalletAdjustment(
      dto.userId,
      dto.amount,
      dto.type,
      dto.reason,
    );

    await this.auditService.log(
      adminId,
      dto.type === 'credit' ? AuditAction.WALLET_CREDIT : AuditAction.WALLET_DEBIT,
      AuditTargetType.WALLET,
      dto.userId,
      dto.reason,
      { amount: dto.amount, type: dto.type, transactionId: transaction.id },
    );

    return { success: true, data: transaction, message: `Wallet ${dto.type} applied` };
  }

  @Get('admin/transaction-caps')
  @Public()
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.WALLET_READ)
  @ApiOperation({
    summary: 'List cumulative transaction caps (admin)',
    description:
      'Per-tier spend & withdrawal ceilings. `amount` is Naira; null = unlimited. Only the `daily` period is enforced in v1.',
  })
  @ApiResponse({
    status: 200,
    description: 'Caps retrieved',
    schema: {
      example: {
        success: true,
        data: [
          { tier: 'tier_0', capType: 'spend', period: 'daily', amount: 100000 },
          { tier: 'tier_0', capType: 'withdrawal', period: 'daily', amount: 50000 },
          { tier: 'tier_2', capType: 'spend', period: 'daily', amount: null },
        ],
      },
    },
  })
  async adminListTransactionCaps() {
    const caps = await this.velocityService.listCaps();
    return { success: true, data: caps };
  }

  @Patch('admin/transaction-caps')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(AdminJwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.WALLET_MANAGE)
  @ApiOperation({
    summary: 'Update a cumulative transaction cap (admin)',
    description:
      'Set the ceiling for one (tier, capType, period). Send `amount: null` for unlimited. Requires wallet:manage; audit-logged. Takes effect immediately (cache is busted).',
  })
  @ApiResponse({
    status: 200,
    description: 'Cap updated',
    schema: {
      example: {
        success: true,
        data: { tier: 'tier_1', capType: 'withdrawal', period: 'daily', amount: 250000 },
        message: 'Transaction cap updated',
      },
    },
  })
  async adminUpdateTransactionCap(
    @CurrentAdmin('id') adminId: string,
    @Body() dto: UpdateTransactionCapDto,
  ) {
    const cap = await this.velocityService.updateCap(
      dto.tier,
      dto.capType,
      dto.period,
      dto.amount,
    );

    await this.auditService.log(
      adminId,
      AuditAction.TRANSACTION_CAP_UPDATE,
      AuditTargetType.WALLET,
      `cap:${dto.tier}:${dto.capType}:${dto.period}`,
      undefined,
      {
        tier: dto.tier,
        capType: dto.capType,
        period: dto.period,
        amount: dto.amount,
      },
    );

    return { success: true, data: cap, message: 'Transaction cap updated' };
  }
}
