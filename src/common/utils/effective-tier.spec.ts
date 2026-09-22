import { effectiveTier } from './effective-tier';
import {
  AccountType,
  VerificationTier,
} from '../../database/entities/user.entity';
import { VendorStatus } from '../../database/entities/vendor-profile.entity';

describe('effectiveTier', () => {
  it('passes student tiers through unchanged', () => {
    for (const tier of [
      VerificationTier.NONE,
      VerificationTier.TIER_0,
      VerificationTier.TIER_1,
      VerificationTier.TIER_2,
    ]) {
      expect(
        effectiveTier({
          accountType: AccountType.STUDENT,
          verificationTier: tier,
        }),
      ).toBe(tier);
    }
  });

  it('defaults a tier-less student to NONE', () => {
    expect(effectiveTier({ accountType: AccountType.STUDENT })).toBe(
      VerificationTier.NONE,
    );
    expect(effectiveTier({})).toBe(VerificationTier.NONE);
  });

  it('maps an ACTIVE vendor-only account to TIER_2', () => {
    expect(
      effectiveTier({
        accountType: AccountType.VENDOR,
        verificationTier: VerificationTier.NONE,
        vendorStatus: VendorStatus.ACTIVE,
      }),
    ).toBe(VerificationTier.TIER_2);
  });

  it('maps every non-active vendor status to TIER_0 (basic plumbing only)', () => {
    for (const status of [
      VendorStatus.DRAFT,
      VendorStatus.PENDING_REVIEW,
      VendorStatus.REJECTED,
      VendorStatus.SUSPENDED,
      null,
      undefined,
    ]) {
      expect(
        effectiveTier({
          accountType: AccountType.VENDOR,
          verificationTier: VerificationTier.NONE,
          vendorStatus: status as string | null | undefined,
        }),
      ).toBe(VerificationTier.TIER_0);
    }
  });

  it('never lets a vendor-only account inherit a student tier by accident', () => {
    // Even if verificationTier were somehow set, vendor accounts resolve
    // exclusively through vendor status.
    expect(
      effectiveTier({
        accountType: AccountType.VENDOR,
        verificationTier: VerificationTier.TIER_1,
        vendorStatus: VendorStatus.SUSPENDED,
      }),
    ).toBe(VerificationTier.TIER_0);
  });
});
