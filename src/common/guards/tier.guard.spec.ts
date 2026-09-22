import { ForbiddenException } from '@nestjs/common';
import { TierAmountLimitGuard, TIER_AMOUNT_LIMIT_KEY } from './tier.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AccountType,
  VerificationTier,
} from '../../database/entities/user.entity';
import { TIER_BUYING_LIMITS } from '../constants/tier-limits';

/**
 * TierAmountLimitGuard reads one or more body fields and caps each present
 * numeric one at the caller's tier limit. The multi-field form exists for
 * budget ranges: buy requests used to cap only `budgetMax`, so a tier_1 user
 * could post a ₦500k "fixed budget" (budgetMin only) and dodge the ₦60k cap.
 */
function makeGuard(config: any) {
  const reflector: any = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return undefined;
      if (key === TIER_AMOUNT_LIMIT_KEY) return config;
      return undefined;
    }),
  };
  return new TierAmountLimitGuard(reflector);
}

function makeContext(body: any, user: any): any {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => ({ body, user }) }),
  };
}

const tier1 = {
  verificationTier: VerificationTier.TIER_1,
  accountType: AccountType.STUDENT,
};
const tier2 = {
  verificationTier: VerificationTier.TIER_2,
  accountType: AccountType.STUDENT,
};

describe('TierAmountLimitGuard', () => {
  describe('single field (existing behaviour)', () => {
    const guard = makeGuard({ field: 'amount', limits: TIER_BUYING_LIMITS });

    it('passes an amount at the limit', () => {
      expect(guard.canActivate(makeContext({ amount: 60000 }, tier1))).toBe(true);
    });

    it('403s an amount over the limit', () => {
      expect(() =>
        guard.canActivate(makeContext({ amount: 60001 }, tier1)),
      ).toThrow(ForbiddenException);
    });

    it('passes when the field is absent — DTO validation owns that', () => {
      expect(guard.canActivate(makeContext({}, tier1))).toBe(true);
    });

    it('passes anything for an unlimited tier', () => {
      expect(guard.canActivate(makeContext({ amount: 5_000_000 }, tier2))).toBe(true);
    });
  });

  describe('multiple fields (budget range)', () => {
    const guard = makeGuard({
      field: ['budgetMax', 'budgetMin'],
      limits: TIER_BUYING_LIMITS,
    });

    it('caps budgetMin when budgetMax is omitted — closes the fixed-budget bypass', () => {
      expect(() =>
        guard.canActivate(makeContext({ budgetMin: 500000 }, tier1)),
      ).toThrow(ForbiddenException);
    });

    it('names the offending field in the 403 body', () => {
      try {
        guard.canActivate(makeContext({ budgetMin: 500000 }, tier1));
        fail('expected a ForbiddenException');
      } catch (e) {
        expect((e as ForbiddenException).getResponse()).toMatchObject({
          field: 'budgetMin',
          limit: 60000,
          amount: 500000,
          currentTier: VerificationTier.TIER_1,
        });
      }
    });

    it('still caps budgetMax', () => {
      expect(() =>
        guard.canActivate(
          makeContext({ budgetMin: 10000, budgetMax: 60001 }, tier1),
        ),
      ).toThrow(ForbiddenException);
    });

    it('passes a range inside the limit', () => {
      expect(
        guard.canActivate(
          makeContext({ budgetMin: 10000, budgetMax: 60000 }, tier1),
        ),
      ).toBe(true);
    });

    it('passes a partial update that only touches an in-limit field', () => {
      expect(guard.canActivate(makeContext({ budgetMax: 30000 }, tier1))).toBe(true);
    });
  });
});
