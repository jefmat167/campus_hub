import {
  Controller,
  Get,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { VerificationTier } from '../../database/entities/user.entity';

@ApiTags('Wallet')
@Controller('wallet')
@UseGuards(JwtAuthGuard, TierGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

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
}
