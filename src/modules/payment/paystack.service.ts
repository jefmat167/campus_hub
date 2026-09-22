import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

export interface PaystackInitResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackVerifyResponse {
  status: string;
  reference: string;
  /** What the customer was charged, in kobo. When the Paystack account passes
   *  transaction fees to the customer this is requested_amount + fees. */
  amount: number;
  /** What the merchant asked to collect, in kobo — the amount to credit. */
  requested_amount?: number;
  fees?: number;
  currency: string;
  channel: string;
  paid_at: string;
  metadata: Record<string, unknown>;
  customer: {
    email: string;
    phone: string;
  };
}

export interface PaystackTransferResponse {
  status: string;
  reference: string;
  amount: number;
  transfer_code: string;
}

export interface PaystackBankListResponse {
  name: string;
  code: string;
  country: string;
  currency: string;
  type: string;
}

export interface PaystackAccountVerifyResponse {
  account_number: string;
  account_name: string;
  bank_id: number;
}

@Injectable()
export class PaystackService {
  private readonly logger = new Logger(PaystackService.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly isConfigured: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.secretKey = this.configService.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    this.baseUrl = this.configService.getOrThrow<string>('PAYSTACK_BASE_URL')
    this.isConfigured = !!this.secretKey;

    if (!this.isConfigured) {
      this.logger.warn('Paystack is not configured. Payment features will be disabled.');
    }
  }

  private getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  private checkConfigured() {
    if (!this.isConfigured) {
      throw new InternalServerErrorException('Payment service is not configured');
    }
  }

  async initializeTransaction(
    email: string,
    amount: number, // in Naira (will be converted to kobo)
    reference: string,
    metadata: Record<string, unknown> = {},
    callbackUrl?: string,
  ): Promise<PaystackInitResponse> {
    this.checkConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transaction/initialize`,
          {
            email,
            amount: Math.round(amount * 100), // Convert to kobo
            reference,
            metadata,
            callback_url: callbackUrl,
            channels: ['card', 'bank', 'ussd', 'bank_transfer'],
          },
          { headers: this.getHeaders() },
        ),
      );

      if (!response.data.status) {
        throw new BadRequestException(response.data.message || 'Failed to initialize transaction');
      }

      this.logger.log(`Transaction initialized: ${reference}`);
      return response.data.data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to initialize transaction', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to initialize payment');
    }
  }

  async verifyTransaction(reference: string): Promise<PaystackVerifyResponse> {
    this.checkConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transaction/verify/${reference}`,
          { headers: this.getHeaders() },
        ),
      );

      if (!response.data.status) {
        throw new BadRequestException(response.data.message || 'Failed to verify transaction');
      }

      return response.data.data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to verify transaction', error.response?.data || error.message);
      const httpStatus: number | undefined = error.response?.status;
      // Paystack 4xx = unknown/invalid reference — the caller's input, not an outage.
      if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
        throw new BadRequestException(
          error.response?.data?.message || 'Transaction reference not found',
        );
      }
      throw new InternalServerErrorException('Failed to verify payment');
    }
  }

  async listBanks(): Promise<PaystackBankListResponse[]> {
    this.checkConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/bank?country=nigeria`,
          { headers: this.getHeaders() },
        ),
      );

      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to list banks', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to fetch bank list');
    }
  }

  async verifyBankAccount(
    accountNumber: string,
    bankCode: string,
  ): Promise<PaystackAccountVerifyResponse> {
    this.checkConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
          { headers: this.getHeaders() },
        ),
      );

      if (!response.data.status) {
        throw new BadRequestException('Invalid bank account');
      }

      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to verify bank account', error.response?.data || error.message);
      if (error.response?.status === 422) {
        throw new BadRequestException('Invalid bank account details');
      }
      throw new InternalServerErrorException('Failed to verify bank account');
    }
  }

  async createTransferRecipient(
    accountNumber: string,
    bankCode: string,
    accountName: string,
  ): Promise<string> {
    this.checkConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transferrecipient`,
          {
            type: 'nuban',
            name: accountName,
            account_number: accountNumber,
            bank_code: bankCode,
            currency: 'NGN',
          },
          { headers: this.getHeaders() },
        ),
      );

      if (!response.data.status) {
        throw new BadRequestException(response.data.message || 'Failed to create recipient');
      }

      this.logger.log(`Transfer recipient created: ${accountNumber}`);
      return response.data.data.recipient_code;
    } catch (error) {
      this.logger.error('Failed to create transfer recipient', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to create transfer recipient');
    }
  }

  async initiateTransfer(
    recipientCode: string,
    amount: number, // in Naira
    reference: string,
    reason: string = 'Wallet withdrawal',
  ): Promise<PaystackTransferResponse> {
    this.checkConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/transfer`,
          {
            source: 'balance',
            amount: Math.round(amount * 100), // Convert to kobo
            recipient: recipientCode,
            reference,
            reason,
          },
          { headers: this.getHeaders() },
        ),
      );

      if (!response.data.status) {
        throw new BadRequestException(response.data.message || 'Failed to initiate transfer');
      }

      this.logger.log(`Transfer initiated: ${reference}`);
      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to initiate transfer', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to initiate withdrawal');
    }
  }

  async getTransferStatus(transferCode: string): Promise<any> {
    this.checkConfigured();

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transfer/${transferCode}`,
          { headers: this.getHeaders() },
        ),
      );

      return response.data.data;
    } catch (error) {
      this.logger.error('Failed to get transfer status', error.response?.data || error.message);
      throw new InternalServerErrorException('Failed to get transfer status');
    }
  }

  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    if (!this.isConfigured || !signature) return false;

    const hash = crypto
      .createHmac('sha512', this.secretKey)
      .update(payload)
      .digest('hex');

    const expected = Buffer.from(hash, 'utf8');
    const provided = Buffer.from(signature, 'utf8');

    // Constant-time comparison; length guard avoids timingSafeEqual throwing.
    return (
      expected.length === provided.length &&
      crypto.timingSafeEqual(expected, provided)
    );
  }

  generateReference(prefix: string = 'TXN'): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${timestamp}_${random}`.toUpperCase();
  }

  isPaystackConfigured(): boolean {
    return this.isConfigured;
  }
}
