import { BadRequestException } from '@nestjs/common';
import { YouVerifyService } from './youverify.service';
import { KycType } from '../../database/entities/kyc-verification.entity';
import { VerificationTier } from '../../database/entities/user.entity';
import { WalletTransactionType } from '../../database/entities/wallet.entity';
import { PlatformTransactionType } from '../../database/entities/platform-wallet.entity';

/**
 * The ₦100 KYC fee must be a real WalletService ledger debit plus a platform-
 * wallet credit on the SAME transaction as the tier flip — never a bare
 * balance mutation.
 */
function makeService(opts: {
  tier: VerificationTier;
  available?: number;
  bvnVerified?: boolean;
  debitFails?: boolean;
}) {
  const user: any = {
    id: 'u1',
    fullName: 'Ada Obi',
    verificationTier: opts.tier,
    bvnVerified: opts.bvnVerified ?? false,
    ninVerified: false,
    kycAttemptCount: 0,
  };
  const kycRepo: any = {
    create: (o: any) => ({ id: 'kyc-1', ...o }),
    save: jest.fn(async (o: any) => o),
  };
  const userRepo: any = {
    findOne: jest.fn(async () => user),
    save: jest.fn(async (o: any) => o),
  };
  const configService: any = {
    get: (key: string, def?: unknown) => (key === 'NODE_ENV' ? 'development' : def ?? ''),
  };
  const qr = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: { save: jest.fn(async (o: any) => o) },
  };
  const dataSource: any = { createQueryRunner: () => qr };
  const walletService: any = {
    getWallet: jest.fn(async () => ({ availableBalance: opts.available ?? 1_000 })),
    debitWallet: jest.fn(async () => {
      if (opts.debitFails) throw new BadRequestException('Insufficient balance');
      return { id: 'wtx' };
    }),
  };
  const platformWalletService: any = {
    creditPlatformFee: jest.fn(async () => ({ id: 'ptx' })),
  };

  const svc = new YouVerifyService(
    kycRepo,
    userRepo,
    configService,
    dataSource,
    walletService,
    platformWalletService,
  );
  // Skip the dev mock's 1s "API delay" — the provider outcome is not under test.
  (svc as any).mockVerify = jest.fn(async () => ({ success: true, message: 'ok', reference: 'YV-1' }));

  return { svc, user, qr, walletService, platformWalletService, userRepo };
}

describe('YouVerifyService — KYC fee booking', () => {
  it('first Tier-2 upgrade: debits ₦100 via WalletService and credits the platform wallet on the same query runner', async () => {
    const { svc, user, qr, walletService, platformWalletService } = makeService({
      tier: VerificationTier.TIER_1,
    });

    const result = await svc.verifyBvn('u1', '12345678901');

    expect(result.success).toBe(true);
    expect(result.tier2Achieved).toBe(true);
    expect(user.verificationTier).toBe(VerificationTier.TIER_2);

    expect(walletService.debitWallet).toHaveBeenCalledTimes(1);
    const [userId, amount, reference, type, extRef, runner, description] =
      walletService.debitWallet.mock.calls[0];
    expect(userId).toBe('u1');
    expect(amount).toBe(100);
    expect(reference).toBe('KYC_FEE_kyc-1');
    expect(type).toBe(WalletTransactionType.FEE);
    expect(extRef).toBeUndefined();
    expect(runner).toBe(qr);
    expect(description).toMatch(/KYC verification fee/);

    expect(platformWalletService.creditPlatformFee).toHaveBeenCalledTimes(1);
    const [pAmount, escrowId, pType, pDesc, pRunner] =
      platformWalletService.creditPlatformFee.mock.calls[0];
    expect(pAmount).toBe(100);
    expect(escrowId).toBeNull();
    expect(pType).toBe(PlatformTransactionType.KYC_FEE);
    expect(pDesc).toContain('KYC_FEE_kyc-1');
    expect(pRunner).toBe(qr);

    expect(qr.commitTransaction).toHaveBeenCalled();
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('already Tier 2 (adding the second ID): no debit, no platform credit, no balance pre-check', async () => {
    const { svc, walletService, platformWalletService } = makeService({
      tier: VerificationTier.TIER_2,
      bvnVerified: true,
    });

    const result = await svc.verifyNin('u1', '12345678901');

    expect(result.success).toBe(true);
    expect(result.tier2Achieved).toBe(false);
    expect(walletService.getWallet).not.toHaveBeenCalled();
    expect(walletService.debitWallet).not.toHaveBeenCalled();
    expect(platformWalletService.creditPlatformFee).not.toHaveBeenCalled();
  });

  it('refuses up front (before the provider call) when the wallet cannot cover the fee', async () => {
    const { svc, walletService, platformWalletService } = makeService({
      tier: VerificationTier.TIER_1,
      available: 50,
    });

    await expect(svc.verifyBvn('u1', '12345678901')).rejects.toThrow(
      /requires ₦100/,
    );
    expect((svc as any).mockVerify).not.toHaveBeenCalled();
    expect(walletService.debitWallet).not.toHaveBeenCalled();
    expect(platformWalletService.creditPlatformFee).not.toHaveBeenCalled();
  });

  it('a failed debit inside the transaction rolls back the tier flip and books nothing to the platform', async () => {
    const { svc, user, qr, platformWalletService } = makeService({
      tier: VerificationTier.TIER_1,
      debitFails: true,
    });

    await expect(svc.verifyBvn('u1', '12345678901')).rejects.toThrow(
      /requires ₦100/,
    );
    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(platformWalletService.creditPlatformFee).not.toHaveBeenCalled();
    // The user row save lives on the rolled-back runner — the in-memory flip is
    // never committed (the service reloads the user on the next attempt).
    expect(user.verificationTier).toBe(VerificationTier.TIER_2);
    expect(qr.manager.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ verificationTier: VerificationTier.TIER_2 }),
    );
  });
});
