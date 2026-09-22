import { BadRequestException } from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { PaymentController } from './payment.controller';
import { WebhookController } from './webhook.controller';
import { PaystackService, PaystackVerifyResponse } from './paystack.service';
import { WalletService } from '../wallet/wallet.service';
import { SmsService } from '../sms/sms.service';
import { User } from '../../database/entities/user.entity';
import { WalletTransactionType } from '../../database/entities/wallet.entity';

const USER = { id: 'user-1', email: 'buyer@test.ng' } as User;

// Paystack charged ₦5,177.67 (fees passed to the customer) for a ₦5,000 top-up.
function verifyResult(over: Partial<PaystackVerifyResponse> = {}): PaystackVerifyResponse {
  return {
    status: 'success',
    reference: 'FUND_REF',
    amount: 517767,
    requested_amount: 500000,
    fees: 17767,
    currency: 'NGN',
    channel: 'card',
    paid_at: '2026-08-30T00:12:38.000Z',
    metadata: { type: 'wallet_funding', userId: USER.id },
    customer: { email: USER.email, phone: '' },
    ...over,
  };
}

describe('PaymentController.verifyFunding', () => {
  let paystack: { verifyTransaction: jest.Mock };
  let wallet: {
    getTransactionByReference: jest.Mock;
    creditWallet: jest.Mock;
    getBalance: jest.Mock;
  };
  let controller: PaymentController;

  beforeEach(() => {
    paystack = { verifyTransaction: jest.fn() };
    wallet = {
      getTransactionByReference: jest.fn().mockResolvedValue(null),
      creditWallet: jest.fn().mockResolvedValue({ id: 'tx-1', amount: 5000 }),
      getBalance: jest.fn().mockResolvedValue({
        balance: 1005000,
        lockedBalance: 26000,
        availableBalance: 979000,
      }),
    };
    controller = new PaymentController(
      paystack as unknown as PaystackService,
      wallet as unknown as WalletService,
      {} as SmsService,
    );
  });

  it('credits the requested top-up, not the gross charge with customer-borne fees', async () => {
    paystack.verifyTransaction.mockResolvedValue(verifyResult());

    await controller.verifyFunding(USER, { reference: 'FUND_REF' });

    expect(wallet.creditWallet).toHaveBeenCalledWith(
      USER.id,
      5000, // ₦5,000 requested — not the ₦5,177.67 charged
      'FUND_REF',
      WalletTransactionType.DEPOSIT,
      'FUND_REF',
    );
  });

  it('never credits more than was actually paid (partial payment guard)', async () => {
    paystack.verifyTransaction.mockResolvedValue(
      verifyResult({ amount: 300000, requested_amount: 500000 }),
    );

    await controller.verifyFunding(USER, { reference: 'FUND_REF' });

    expect(wallet.creditWallet).toHaveBeenCalledWith(
      USER.id,
      3000,
      'FUND_REF',
      WalletTransactionType.DEPOSIT,
      'FUND_REF',
    );
  });

  it('falls back to the charged amount when requested_amount is absent', async () => {
    paystack.verifyTransaction.mockResolvedValue(
      verifyResult({ amount: 500000, requested_amount: undefined }),
    );

    await controller.verifyFunding(USER, { reference: 'FUND_REF' });

    expect(wallet.creditWallet).toHaveBeenCalledWith(
      USER.id,
      5000,
      'FUND_REF',
      WalletTransactionType.DEPOSIT,
      'FUND_REF',
    );
  });

  it('returns balance as the naira number the docs promise, not the getBalance object', async () => {
    paystack.verifyTransaction.mockResolvedValue(verifyResult());

    const res = await controller.verifyFunding(USER, { reference: 'FUND_REF' });

    expect(res.data.balance).toBe(1005000);
  });

  it('returns a numeric balance on the already-credited idempotent path too', async () => {
    paystack.verifyTransaction.mockResolvedValue(verifyResult());
    wallet.getTransactionByReference.mockResolvedValue({ id: 'tx-1' });

    const res = await controller.verifyFunding(USER, { reference: 'FUND_REF' });

    expect(res.data.balance).toBe(1005000);
    expect(wallet.creditWallet).not.toHaveBeenCalled();
  });

  it('rejects an unpaid/abandoned transaction with 400', async () => {
    paystack.verifyTransaction.mockResolvedValue(verifyResult({ status: 'abandoned' }));

    await expect(
      controller.verifyFunding(USER, { reference: 'FUND_REF' }),
    ).rejects.toThrow(BadRequestException);
    expect(wallet.creditWallet).not.toHaveBeenCalled();
  });

  it("rejects a payment that belongs to someone else's account", async () => {
    paystack.verifyTransaction.mockResolvedValue(
      verifyResult({ metadata: { type: 'wallet_funding', userId: 'other-user' } }),
    );

    await expect(
      controller.verifyFunding(USER, { reference: 'FUND_REF' }),
    ).rejects.toThrow(BadRequestException);
    expect(wallet.creditWallet).not.toHaveBeenCalled();
  });
});

describe('WebhookController charge.success crediting', () => {
  function makeRequest(event: object): RawBodyRequest<Request> {
    return { rawBody: Buffer.from(JSON.stringify(event)) } as RawBodyRequest<Request>;
  }

  let wallet: { getTransactionByReference: jest.Mock; creditWallet: jest.Mock };
  let controller: WebhookController;

  beforeEach(() => {
    wallet = {
      getTransactionByReference: jest.fn().mockResolvedValue(null),
      creditWallet: jest.fn().mockResolvedValue({ id: 'tx-1' }),
    };
    const paystack = { verifyWebhookSignature: jest.fn().mockReturnValue(true) };
    controller = new WebhookController(
      paystack as unknown as PaystackService,
      wallet as unknown as WalletService,
    );
  });

  it('credits requested_amount when Paystack fees were passed to the customer', async () => {
    const event = {
      event: 'charge.success',
      data: {
        reference: 'FUND_REF',
        amount: 517767,
        requested_amount: 500000,
        status: 'success',
        metadata: { type: 'wallet_funding', userId: USER.id },
      },
    };

    await controller.handlePaystackWebhook(makeRequest(event), 'sig');

    expect(wallet.creditWallet).toHaveBeenCalledWith(
      USER.id,
      5000,
      'FUND_REF',
      WalletTransactionType.DEPOSIT,
      'FUND_REF',
    );
  });

  it('credits the charged amount when requested_amount is absent', async () => {
    const event = {
      event: 'charge.success',
      data: {
        reference: 'FUND_REF',
        amount: 500000,
        status: 'success',
        metadata: { type: 'wallet_funding', userId: USER.id },
      },
    };

    await controller.handlePaystackWebhook(makeRequest(event), 'sig');

    expect(wallet.creditWallet).toHaveBeenCalledWith(
      USER.id,
      5000,
      'FUND_REF',
      WalletTransactionType.DEPOSIT,
      'FUND_REF',
    );
  });
});
