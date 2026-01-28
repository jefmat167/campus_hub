import { SetMetadata } from '@nestjs/common';
import { VerificationTier } from '../../database/entities/user.entity';

export const MIN_TIER_KEY = 'minTier';

/**
 * Decorator to specify the minimum verification tier required for an endpoint.
 *
 * Usage:
 * ```typescript
 * @MinTier(VerificationTier.TIER_1)
 * @Post('listings')
 * createListing() { ... }
 * ```
 *
 * Tier hierarchy (higher includes all lower):
 * - TIER_2: Full access (BVN/NIN verified)
 * - TIER_1: Student verified (documents approved)
 * - TIER_0: Phone + Email verified
 * - NONE: Just registered (browse only)
 */
export const MinTier = (tier: VerificationTier) =>
  SetMetadata(MIN_TIER_KEY, tier);

/**
 * Tier level numeric values for comparison
 */
export const TIER_LEVELS: Record<VerificationTier, number> = {
  [VerificationTier.NONE]: 0,
  [VerificationTier.TIER_0]: 1,
  [VerificationTier.TIER_1]: 2,
  [VerificationTier.TIER_2]: 3,
};

/**
 * Check if a user's tier meets the minimum required tier
 */
export function tierMeetsRequirement(
  userTier: VerificationTier,
  requiredTier: VerificationTier,
): boolean {
  return TIER_LEVELS[userTier] >= TIER_LEVELS[requiredTier];
}
