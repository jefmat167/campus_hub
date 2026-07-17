import {
  Controller,
  Post,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
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
    // Dispute/refund payloads reference the original charge differently.
    transaction_reference?: string;
    transaction?: { reference?: string };
  };
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly paystackService: PaystackService,
    private readonly walletService: WalletService,
  ) { }

  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paystack webhook', description: 'Handles Paystack webhook events (charge.success, transfer.success, transfer.failed, transfer.reversed). Signature is verified using HMAC-SHA512.' })
  @ApiHeader({ name: 'x-paystack-signature', description: 'HMAC-SHA512 signature from Paystack', required: true })
  @ApiResponse({ status: 200, description: 'Webhook processed', schema: { example: { received: true } } })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handlePaystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    // Verify signature over the exact raw bytes Paystack sent (never a
    // re-serialized body — key order/whitespace would break the HMAC).
    const rawBody = req.rawBody;
    if (
      !rawBody ||
      !this.paystackService.verifyWebhookSignature(rawBody, signature)
    ) {
      this.logger.warn('Invalid Paystack webhook signature');
      throw new UnauthorizedException('Invalid signature');
    }

    const body = JSON.parse(rawBody.toString('utf8')) as PaystackWebhookEvent;
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

        case 'charge.dispute.create':
          await this.handleChargeDispute(data);
          break;

        case 'refund.processed':
          await this.handleRefundProcessed(data);
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

  // A cardholder disputed a charge that funded a wallet (chargeback). Claw the
  // deposit back and freeze the wallet.
  private async handleChargeDispute(data: PaystackWebhookEvent['data']) {
    const reference = data.transaction?.reference ?? data.reference;
    if (!reference) {
      this.logger.error('No transaction reference in dispute payload');
      return;
    }
    await this.walletService.reverseDeposit(reference, 'charge dispute');
    this.logger.warn(`Chargeback processed for deposit ${reference}`);
  }

  // A refund was processed against a charge that funded a wallet.
  private async handleRefundProcessed(data: PaystackWebhookEvent['data']) {
    const reference =
      data.transaction_reference ?? data.transaction?.reference ?? data.reference;
    if (!reference) {
      this.logger.error('No transaction reference in refund payload');
      return;
    }
    await this.walletService.reverseDeposit(reference, 'refund processed');
    this.logger.warn(`Refund reversal processed for deposit ${reference}`);
  }
}
