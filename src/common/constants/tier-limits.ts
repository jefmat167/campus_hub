import { VerificationTier } from '../../database/entities/user.entity';

/**
 * Single source of truth for the per-transaction tier amount limits (naira;
 * null = unlimited). Used by the @TierAmountLimit guard configs on
 * controllers AND by service-level checks (buy-request accept today, the
 * checkout total from rev-2 Phase 3) — so the two can never drift.
 *
 * Rev-2 semantics: buying limits apply to the CHECKOUT TOTAL (spec 01.6);
 * selling limits are per listing price, P2P only.
 */
export type TierLimitTable = Record<VerificationTier, number | null>;

export const TIER_BUYING_LIMITS: TierLimitTable = {
  [VerificationTier.NONE]: 0,
  [VerificationTier.TIER_0]: 30000,
  [VerificationTier.TIER_1]: 60000,
  [VerificationTier.TIER_2]: null,
};

export const TIER_SELLING_LIMITS: TierLimitTable = {
  [VerificationTier.NONE]: 0,
  [VerificationTier.TIER_0]: 0,
  [VerificationTier.TIER_1]: 50000,
  [VerificationTier.TIER_2]: null,
};

export const TIER_HOUSING_LIMITS: TierLimitTable = {
  [VerificationTier.NONE]: 0,
  [VerificationTier.TIER_0]: 0,
  [VerificationTier.TIER_1]: 50000,
  [VerificationTier.TIER_2]: null,
};

export const TIER_LIMIT_TABLES = {
  buying: TIER_BUYING_LIMITS,
  selling: TIER_SELLING_LIMITS,
  housing: TIER_HOUSING_LIMITS,
} as const;

export type TierLimitType = keyof typeof TIER_LIMIT_TABLES;
