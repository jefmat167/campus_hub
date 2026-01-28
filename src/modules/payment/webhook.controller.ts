import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { PaystackService } from './paystack.service';
import { WalletService } from '../wallet/wallet.service';
import { WalletTransactionType } from '../../database/entities/wallet.entity';

interface PaystackWebhookEvent {
  event: string;
  data: {
    reference: string;
    amount: number;
    status: string;
    metadata?: Record<string, unknown>;
    transfer_code?: string;
    recipient?: {
      recipient_code: string;
    };
  };
}

@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly walletService: WalletService,
  ) {}

  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  async handlePaystackWebhook(
    @Body() body: PaystackWebhookEvent,
    @Headers('x-paystack-signature') signature: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    // Verify webhook signature
    const rawBody = JSON.stringify(body);
    if (!this.paystackService.verifyWebhookSignature(rawBody, signature)) {
      this.logger.warn('Invalid Paystack webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const { event, data } = body;
    this.logger.log(`Received Paystack webhook: ${event}`);

    try {
      switch (event) {
        case 'charge.success':
          await this.handleChargeSuccess(data);
          break;

        case 'transfer.success':
          await this.handleTransferSuccess(data);
          break;

        case 'transfer.failed':
          await this.handleTransferFailed(data);
          break;

        case 'transfer.reversed':
          await this.handleTransferReversed(data);
          break;

        default:
          this.logger.log(`Unhandled Paystack event: ${event}`);
      }
    } catch (error) {
      this.logger.error(`Error processing webhook ${event}:`, error);
      // Don't throw - return 200 to prevent Paystack retries
    }

    return { received: true };
  }

  private async handleChargeSuccess(data: PaystackWebhookEvent['data']) {
    const { reference, amount, metadata } = data;

    // Check if this is a wallet funding
    if (metadata?.type !== 'wallet_funding') {
      this.logger.log(`Charge ${reference} is not a wallet funding`);
      return;
    }

    const userId = metadata.userId as string;
    if (!userId) {
      this.logger.error(`No userId in charge metadata: ${reference}`);
      return;
    }

    // Check if already processed
    const existingTransaction = await this.walletService.getTransactionByReference(reference);
    if (existingTransaction) {
      this.logger.log(`Transaction ${reference} already processed`);
      return;
    }

    // Credit wallet (amount is in kobo)
    const amountInNaira = amount / 100;
    await this.walletService.creditWallet(
      userId,
      amountInNaira,
      reference,
      WalletTransactionType.DEPOSIT,
      reference,
    );

    this.logger.log(`Credited ₦${amountInNaira} to user ${userId}`);
  }

  private async handleTransferSuccess(data: PaystackWebhookEvent['data']) {
    const { reference } = data;

    await this.walletService.confirmWithdrawal(reference);
    this.logger.log(`Transfer ${reference} confirmed`);
  }

  private async handleTransferFailed(data: PaystackWebhookEvent['data']) {
    const { reference } = data;

    await this.walletService.reverseWithdrawal(reference);
    this.logger.log(`Transfer ${reference} failed, funds reversed`);
  }

  private async handleTransferReversed(data: PaystackWebhookEvent['data']) {
    const { reference } = data;

    await this.walletService.reverseWithdrawal(reference);
    this.logger.log(`Transfer ${reference} reversed`);
  }
}
