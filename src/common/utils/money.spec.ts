import {
  toKobo,
  toNaira,
  splitFee,
  splitByPercent,
  percentOf,
} from './money';

describe('money helpers', () => {
  describe('toKobo / toNaira', () => {
    it('round-trips exactly', () => {
      for (const naira of [0, 1, 333, 29999.99, 1000000, 324.68]) {
        expect(toNaira(toKobo(naira))).toBe(naira);
      }
    });

    it('rounds sub-kobo input to the nearest kobo', () => {
      expect(toKobo(8.336)).toBe(834);
      expect(toKobo(8.334)).toBe(833);
    });
  });

  describe('splitFee', () => {
    // The core invariant behind fix #4: fee + payout must equal the amount
    // to the kobo, for every amount — no float drift.
    const amounts = [333, 100, 10000, 29999, 60000, 1, 12345.67, 999999.99];

    it.each(amounts)('fee + payout === amount for ₦%s (2.5%)', (amount) => {
      const { fee, payout } = splitFee(amount, 2.5);
      expect(toKobo(fee) + toKobo(payout)).toBe(toKobo(amount));
    });

    it('computes the documented example (₦333 @ 2.5%)', () => {
      const { fee, payout } = splitFee(333, 2.5);
      expect(fee).toBe(8.33); // 832.5 kobo -> 833
      expect(payout).toBe(324.67);
    });

    it('never produces more than 2 decimal places', () => {
      const { fee, payout } = splitFee(12345.67, 2.5);
      expect(toKobo(fee) % 1).toBe(0);
      expect(toKobo(payout) % 1).toBe(0);
    });
  });

  describe('splitByPercent', () => {
    it('portion + remainder === amount exactly (60/40 cancellation split)', () => {
      for (const amount of [1000, 333, 12345.67, 5000, 1]) {
        const { portion, remainder } = splitByPercent(amount, 60);
        expect(toKobo(portion) + toKobo(remainder)).toBe(toKobo(amount));
      }
    });

    it('gives the larger share to the portion for 60%', () => {
      const { portion, remainder } = splitByPercent(1000, 60);
      expect(portion).toBe(600);
      expect(remainder).toBe(400);
    });
  });

  describe('percentOf', () => {
    it('computes a kobo-rounded percentage', () => {
      expect(percentOf(1000, 10)).toBe(100);
      expect(percentOf(29999, 1)).toBe(299.99);
      expect(percentOf(333, 1)).toBe(3.33);
    });
  });

  describe('dispute split (1% from each side)', () => {
    // Mirrors the RESOLVED_SPLIT accounting: gross buyer refund + seller
    // release sum to the amount; platform takes 1% of each; the three final
    // buckets must still sum to the amount.
    it.each([
      [10000, 6000, 4000],
      [333, 111, 222],
      [29999, 15000, 14999],
    ])(
      'buckets sum to amount for amount=%s refund=%s release=%s',
      (amount, refundGross, releaseGross) => {
        const platformFromRefund = percentOf(refundGross, 1);
        const platformFromRelease = percentOf(releaseGross, 1);
        const toPlatform = toNaira(
          toKobo(platformFromRefund) + toKobo(platformFromRelease),
        );
        const toSeller = toNaira(
          toKobo(releaseGross) - toKobo(platformFromRelease),
        );
        const refund = toNaira(
          toKobo(amount) - toKobo(toSeller) - toKobo(toPlatform),
        );

        expect(toKobo(refundGross) + toKobo(releaseGross)).toBe(toKobo(amount));
        expect(toKobo(toSeller) + toKobo(toPlatform) + toKobo(refund)).toBe(
          toKobo(amount),
        );
        expect(refund).toBe(toNaira(toKobo(refundGross) - toKobo(platformFromRefund)));
      },
    );
  });
});
