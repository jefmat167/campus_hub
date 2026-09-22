import {
  AccountType,
  VerificationTier,
} from '../../database/entities/user.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';

/**
 * The tier the platform's money/permission rules should treat this account
 * as holding (marketplace rev-2 spec 01.5).
 *
 * Student accounts: their real verification tier — unchanged behaviour.
 *
 * Vendor-only accounts hold no student tier (verificationTier stays NONE),
 * so their standing maps from vendor verification instead:
 * - ACTIVE vendor → TIER_2-equivalent (it rests on the same BVN/NIN check),
 *   unlocking withdrawals and TIER_2 velocity caps for business income.
 * - anything pre-approval (draft/pending/rejected/suspended) → TIER_0-
 *   equivalent: basic plumbing only (uploads for the shopfront photo, wallet
 *   views/funding), with TIER_0 velocity caps bounding any money movement.
 *   Student-only surfaces stay closed regardless via StudentAccountGuard.
 *
 * `vendorStatus` is attached to request.user by JwtStrategy (vendor accounts
 * only); VelocityService resolves it fresh from the DB instead.
 */
export function effectiveTier(user: {
  verificationTier?: VerificationTier;
  accountType?: AccountType | string;
  vendorStatus?: string | null;
}): VerificationTier {
  if (user.accountType === AccountType.VENDOR) {
    return user.vendorStatus === VendorStatus.ACTIVE
      ? VerificationTier.TIER_2
      : VerificationTier.TIER_0;
  }
  return user.verificationTier || VerificationTier.NONE;
}
