import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { WalletTransactionType } from '../../database/entities/wallet.entity';
import { PaystackService } from './paystack.service';
import { WalletService } from '../wallet/wallet.service';
import { SmsService } from '../sms/sms.service';
import {
  InitializeFundingDto,
  VerifyPaymentDto,
  AddBankAccountDto,
  InitiateWithdrawalDto,
  VerifyAccountDto,
} from './dto';

@ApiTags('Payment')
@Controller('payment')
@UseGuards(JwtAuthGuard, TierGuard)
@MinTier(VerificationTier.TIER_0)
@ApiBearerAuth()
export class PaymentController {
  private readonly HIGH_VALUE_THRESHOLD = 50000; // ₦50,000

  constructor(
    private readonly paystackService: PaystackService,
    private readonly walletService: WalletService,
    private readonly smsService: SmsService,
  ) { }

  @Get('banks')
  @ApiOperation({ summary: 'List all Nigerian banks' })
  @ApiResponse({
    status: 200,
    description: 'List of banks retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          { name: 'Access Bank', code: '044' },
          { name: 'GTBank', code: '058' },
          { name: 'First Bank of Nigeria', code: '011' },
        ],
      },
    },
  })
  async listBanks() {
    const banks = await this.paystackService.listBanks();
    return {
      success: true,
      data: banks,
    };
  }

  @Post('verify-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify bank account number' })
  @ApiResponse({
    status: 200,
    description: 'Account verified successfully',
    schema: {
      example: {
        success: true,
        data: {
          accountNumber: '0123456789',
          accountName: 'JOHN DOE',
          bankCode: '058',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid bank account details',
  })
  async verifyAccount(@Body() dto: VerifyAccountDto) {
    const accountDetails = await this.paystackService.verifyBankAccount(
      dto.accountNumber,
      dto.bankCode,
    );

    return {
      success: true,
      data: {
        accountNumber: dto.accountNumber,
        accountName: accountDetails.account_name,
        bankCode: dto.bankCode,
      },
    };
  }

  @Post('fund/initialize')
  @ApiOperation({ summary: 'Initialize wallet funding via Paystack' })
  @ApiResponse({
    status: 201,
    description: 'Payment initialized successfully',
    schema: {
      example: {
        success: true,
        data: {
          authorizationUrl: 'https://checkout.paystack.com/abc123',
          accessCode: 'abc123xyz',
          reference: 'FUND_1234567890',
        },
        message: 'Payment initialized successfully',
      },
    },
  })
  async initializeFunding(
    @CurrentUser() user: User,
    @Body() dto: InitializeFundingDto,
  ) {
    const reference = this.paystackService.generateReference('FUND');

    const result = await this.paystackService.initializeTransaction(
      user.email,
      dto.amount,
      reference,
      {
        type: 'wallet_funding',
        userId: user.id,
      },
      dto.callbackUrl,
    );

    return {
      success: true,
      data: {
        authorizationUrl: result.authorization_url,
        accessCode: result.access_code,
        reference: result.reference,
      },
      message: 'Payment initialized successfully',
    };
  }

  @Post('fund/verify')
  @ApiOperation({ summary: 'Verify payment and credit wallet' })
  @ApiResponse({
    status: 200,
    description: 'Payment verified and wallet credited',
    schema: {
      example: {
        success: true,
        data: {
          transaction: {
            id: 'uuid',
            type: 'DEPOSIT',
            amount: 5000,
            balanceAfter: 15000,
          },
          balance: 15000,
        },
        message: '₦5,000 has been added to your wallet',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Payment failed or does not belong to user',
  })
  @HttpCode(HttpStatus.OK)
  async verifyFunding(
    @CurrentUser() user: User,
    @Body() dto: VerifyPaymentDto,
  ) {
    const result = await this.paystackService.verifyTransaction(dto.reference);

    if (result.status !== 'success') {
      throw new BadRequestException('Payment was not successful');
    }

    // Verify metadata
    const metadata = result.metadata as Record<string, unknown>;
    if (metadata?.userId !== user.id) {
      throw new BadRequestException('Payment does not belong to this user');
    }

    // Idempotency: if the webhook (or a prior verify) already credited this
    // reference, return the existing state instead of crediting again.
    const existing = await this.walletService.getTransactionByReference(
      dto.reference,
    );
    if (existing) {
      const balance = await this.walletService.getBalance(user.id);
      return {
        success: true,
        data: { transaction: existing, balance },
        message: 'Payment already credited to your wallet',
      };
    }

    // Credit wallet (amount is in kobo, convert to naira)
    const amountInNaira = result.amount / 100;

    const transaction = await this.walletService.creditWallet(
      user.id,
      amountInNaira,
      dto.reference,
      WalletTransactionType.DEPOSIT,
      dto.reference,
    );

    const balance = await this.walletService.getBalance(user.id);

    return {
      success: true,
      data: {
        transaction,
        balance,
      },
      message: `₦${amountInNaira.toLocaleString()} has been added to your wallet`,
    };
  }

  @Post('bank-account')
  @ApiOperation({ summary: 'Add bank account for withdrawals' })
  @ApiResponse({
    status: 201,
    description: 'Bank account added successfully',
    schema: {
      example: {
        success: true,
        data: {
          accountNumber: '0123456789',
          accountName: 'JOHN DOE',
          bankName: 'GTBank',
        },
        message: 'Bank account added successfully',
      },
    },
  })
  async addBankAccount(
    @CurrentUser() user: User,
    @Body() dto: AddBankAccountDto,
  ) {
    // Verify bank account with Paystack
    const accountDetails = await this.paystackService.verifyBankAccount(
      dto.accountNumber,
      dto.bankCode,
    );

    // Get bank name from bank list
    const banks = await this.paystackService.listBanks();
    const bank = banks.find((b) => b.code === dto.bankCode);

    // Create transfer recipient for future withdrawals
    const recipientCode = await this.paystackService.createTransferRecipient(
      dto.accountNumber,
      dto.bankCode,
      accountDetails.account_name,
    );

    // Update wallet with bank details
    const wallet = await this.walletService.updateBankAccount(
      user.id,
      dto.accountNumber,
      dto.bankCode,
      bank?.name || 'Unknown Bank',
      accountDetails.account_name,
    );

    // Store recipient code
    await this.walletService.updatePaystackRecipientCode(user.id, recipientCode);

    return {
      success: true,
      data: {
        accountNumber: dto.accountNumber,
        accountName: accountDetails.account_name,
        bankName: bank?.name || 'Unknown Bank',
      },
      message: 'Bank account added successfully',
    };
  }

  @Post('withdraw/request-otp')
  @ApiOperation({ summary: 'Request OTP for withdrawal verification' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      example: {
        success: true,
        message: 'OTP sent to your phone',
      },
    },
  })
  @HttpCode(HttpStatus.OK)
  async requestWithdrawalOtp(@CurrentUser() user: User) {
    // Send OTP for withdrawal verification
    await this.smsService.sendOtp(user.phone, 'withdrawal');

    return {
      success: true,
      message: 'OTP sent to your phone',
    };
  }

  @Post('withdraw')
  @ApiOperation({ summary: 'Initiate withdrawal to bank account' })
  @ApiResponse({
    status: 201,
    description: 'Withdrawal initiated successfully',
    schema: {
      example: {
        success: true,
        data: {
          reference: 'WD_1234567890',
          amount: 10000,
          status: 'pending',
          balance: 5000,
        },
        message: 'Withdrawal initiated successfully. You will receive the funds shortly.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Insufficient balance, no bank account, or invalid OTP',
  })
  async initiateWithdrawal(
    @CurrentUser() user: User,
    @Body() dto: InitiateWithdrawalDto,
  ) {
    // Get wallet and verify balance
    const wallet = await this.walletService.getWallet(user.id);

    if (wallet.availableBalance < dto.amount) {
      throw new BadRequestException('Insufficient balance');
    }

    if (!wallet.paystackRecipientCode) {
      throw new BadRequestException(
        'Please add a bank account before withdrawing',
      );
    }

    // Require OTP for high-value transactions
    if (dto.amount >= this.HIGH_VALUE_THRESHOLD) {
      if (!dto.otp) {
        throw new BadRequestException(
          'OTP is required for withdrawals of ₦50,000 and above',
        );
      }

      // Verify OTP
      const isValidOtp = await this.smsService.verifyOtp(
        user.phone,
        dto.otp,
        'withdrawal',
      );

      if (!isValidOtp) {
        throw new BadRequestException('Invalid or expired OTP');
      }
    }

    const reference = this.paystackService.generateReference('WD');

    // Debit wallet and record a PENDING withdrawal atomically. The webhook
    // (transfer.success/failed/reversed) transitions this same transaction.
    await this.walletService.debitForWithdrawal(user.id, dto.amount, reference);

    // Initiate transfer via Paystack
    try {
      const transfer = await this.paystackService.initiateTransfer(
        wallet.paystackRecipientCode,
        dto.amount,
        reference,
        'Wallet withdrawal',
      );

      const balance = await this.walletService.getBalance(user.id);

      return {
        success: true,
        data: {
          reference,
          amount: dto.amount,
          status: transfer.status,
          balance,
        },
        message: 'Withdrawal initiated successfully. You will receive the funds shortly.',
      };
    } catch (error) {
      // Transfer couldn't be initiated: reverse the PENDING withdrawal so the
      // balance is refunded and the transaction is marked REVERSED.
      await this.walletService.reverseWithdrawal(reference);
      throw error;
    }
  }

  @Get('withdrawal-status/:reference')
  @ApiOperation({ summary: 'Get withdrawal status' })
  @ApiResponse({
    status: 200,
    description: 'Withdrawal status info',
    schema: {
      example: {
        success: true,
        message: 'Check your transaction history for status updates',
      },
    },
  })
  async getWithdrawalStatus() {
    // This would check the status of a withdrawal
    // For now, webhooks handle status updates
    return {
      success: true,
      message: 'Check your transaction history for status updates',
    };
  }
}
