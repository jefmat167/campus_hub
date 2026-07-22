import { ForbiddenException } from '@nestjs/common';
import { VelocityService } from './velocity.service';
import {
  TransactionCapType,
  TransactionCapPeriod,
} from '../../database/entities/transaction-cap.entity';
import { VerificationTier } from '../../database/entities/user.entity';

type CapRow = {
  tier: VerificationTier;
  capType: TransactionCapType;
  period: TransactionCapPeriod;
  amount: number | null;
};

function makeService(caps: CapRow[]) {
  const store = new Map<string, unknown>();
  const cache = {
    get: async (k: string) => store.get(k),
    set: async (k: string, v: unknown) => {
      store.set(k, v);
    },
    del: jest.fn(async (k: string) => {
      store.delete(k);
    }),
  };
  const capRepo = {
    find: jest.fn(async () => caps),
    findOne: jest.fn(async () => null),
    create: (o: CapRow) => o,
    save: jest.fn(async (o: CapRow) => o),
  };
  const svc = new VelocityService(capRepo as any, cache as any);
  return { svc, cache, capRepo };
}

/**
 * Mock EntityManager. `rawSumKobo` is the signed SUM the ledger query returns
 * (money-out rows are negative), matching how getRawOne() reads it.
 */
function makeManager(opts: {
  tier?: VerificationTier | null;
  rawSumKobo?: number;
  onSum?: () => void;
}) {
  const qb: any = {
    select: () => qb,
    where: () => qb,
    andWhere: () => qb,
    getRawOne: async () => {
      opts.onSum?.();
      return { sum: String(opts.rawSumKobo ?? 0) };
    },
  };
  return {
    findOne: async () =>
      opts.tier === null
        ? null
        : { id: 'u1', verificationTier: opts.tier ?? VerificationTier.TIER_0 },
    createQueryBuilder: () => qb,
  } as any;
}

const SPEND = TransactionCapType.SPEND;
const WITHDRAWAL = TransactionCapType.WITHDRAWAL;
const DAILY = TransactionCapPeriod.DAILY;

describe('VelocityService.assertWithinCap', () => {
  it('allows a spend that lands exactly on the cap (boundary is inclusive)', async () => {
    const { svc } = makeService([
      { tier: VerificationTier.TIER_0, capType: SPEND, period: DAILY, amount: 100000 },
    ]);
    // ₦95,000 already spent (stored as -9,500,000 kobo), incoming ₦5,000 → ₦100,000.
    const manager = makeManager({ tier: VerificationTier.TIER_0, rawSumKobo: -9_500_000 });

    await expect(
      svc.assertWithinCap(manager, {
        userId: 'u1',
        walletId: 'w1',
        capType: SPEND,
        incomingNaira: 5000,
      }),
    ).resolves.toBeUndefined();
  });

  it('blocks a spend over the cap with an enriched 403 (kobo→naira correct)', async () => {
    const { svc } = makeService([
      { tier: VerificationTier.TIER_0, capType: SPEND, period: DAILY, amount: 100000 },
    ]);
    const manager = makeManager({ tier: VerificationTier.TIER_0, rawSumKobo: -9_500_000 });

    expect.assertions(6);
    try {
      await svc.assertWithinCap(manager, {
        userId: 'u1',
        walletId: 'w1',
        capType: SPEND,
        incomingNaira: 6000, // 95k + 6k = 101k > 100k
      });
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const body = (e as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(body.limit).toBe(100000);
      expect(body.capType).toBe(SPEND);
      expect(body.period).toBe(DAILY);
      expect(body.spentSoFar).toBe(95000); // -(-9,500,000)/100
      expect(body.remaining).toBe(5000);
    }
  });

  it('treats a null cap as unlimited and never queries the ledger', async () => {
    const { svc } = makeService([
      { tier: VerificationTier.TIER_2, capType: SPEND, period: DAILY, amount: null },
    ]);
    // getRawOne throws if called — proves the unlimited path short-circuits.
    const manager = makeManager({
      tier: VerificationTier.TIER_2,
      onSum: () => {
        throw new Error('ledger should not be summed for an unlimited cap');
      },
    });

    await expect(
      svc.assertWithinCap(manager, {
        userId: 'u1',
        walletId: 'w1',
        capType: SPEND,
        incomingNaira: 5_000_000,
      }),
    ).resolves.toBeUndefined();
  });

  it('allows when no cap row is configured for the tier/type', async () => {
    const { svc } = makeService([]); // empty caps table
    const manager = makeManager({ tier: VerificationTier.TIER_1, rawSumKobo: -1_000_000 });

    await expect(
      svc.assertWithinCap(manager, {
        userId: 'u1',
        walletId: 'w1',
        capType: WITHDRAWAL,
        incomingNaira: 50000,
      }),
    ).resolves.toBeUndefined();
  });

  it('enforces the withdrawal cap independently of spend', async () => {
    const { svc } = makeService([
      { tier: VerificationTier.TIER_1, capType: WITHDRAWAL, period: DAILY, amount: 200000 },
    ]);
    // ₦180,000 withdrawn (−18,000,000 kobo); incoming ₦30,000 → ₦210,000 > cap.
    const manager = makeManager({ tier: VerificationTier.TIER_1, rawSumKobo: -18_000_000 });

    await expect(
      svc.assertWithinCap(manager, {
        userId: 'u1',
        walletId: 'w1',
        capType: WITHDRAWAL,
        incomingNaira: 30000,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('falls back to the NONE tier when the user cannot be resolved', async () => {
    // No cap configured for NONE → unlimited/no-op (NONE is blocked upstream anyway).
    const { svc } = makeService([
      { tier: VerificationTier.TIER_0, capType: SPEND, period: DAILY, amount: 100000 },
    ]);
    const manager = makeManager({ tier: null, rawSumKobo: -50_000_000 });

    await expect(
      svc.assertWithinCap(manager, {
        userId: 'ghost',
        walletId: 'w1',
        capType: SPEND,
        incomingNaira: 999999,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('VelocityService.updateCap', () => {
  it('persists the new figure and busts the caps cache', async () => {
    const { svc, cache, capRepo } = makeService([]);

    await svc.updateCap(VerificationTier.TIER_1, WITHDRAWAL, DAILY, 250000);

    expect(capRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: VerificationTier.TIER_1,
        capType: WITHDRAWAL,
        period: DAILY,
        amount: 250000,
      }),
    );
    expect(cache.del).toHaveBeenCalledWith('transaction_caps:map');
  });
});
