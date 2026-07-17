import type { ValueTransformer } from 'typeorm';

/**
 * TypeORM column transformer: money is stored as integer **kobo** in a
 * `bigint` column, while the entity property stays a **Naira** number. This
 * keeps all app/API semantics in Naira with zero service-layer churn, and
 * guarantees exact integer-kobo storage (no fractional-kobo drift).
 *
 * IMPORTANT: transformers only apply to entity reads/writes. Raw SQL /
 * queryBuilder aggregations (`SUM`, etc.) on these columns return raw kobo and
 * must be divided by 100 in application code.
 */
export const KoboColumnTransformer: ValueTransformer = {
  to(naira: number | null | undefined): number | null | undefined {
    if (naira === null || naira === undefined) return naira;
    return Math.round(naira * 100);
  },
  from(kobo: string | number | null | undefined): number | null | undefined {
    if (kobo === null || kobo === undefined) return kobo;
    return Number(kobo) / 100;
  },
};

/**
 * Money helpers.
 *
 * All splitting/percentage math is done in **integer kobo** (₦1 = 100 kobo)
 * so that the parts of a split always sum back to the whole. Floating-point
 * Naira arithmetic (e.g. `amount * 2.5 / 100`) drifts at 2 d.p. and leaves the
 * ledger unbalanced — a fee and payout that don't add up to the principal.
 *
 * Wallet/escrow money columns are `decimal(12,2)` (exact to the kobo), so the
 * Naira values returned here (kobo / 100) map cleanly onto the schema.
 */

/** Naira → integer kobo. */
export const toKobo = (naira: number): number => Math.round(naira * 100);

/** Integer kobo → Naira. */
export const toNaira = (kobo: number): number => kobo / 100;

/**
 * Split an amount into a fee and the remaining payout.
 * `feePercent` is a percentage (e.g. `2.5` for 2.5%).
 * Guarantees `fee + payout === amount` to the kobo.
 */
export function splitFee(
  amountNaira: number,
  feePercent: number,
): { fee: number; payout: number } {
  const amount = toKobo(amountNaira);
  const fee = Math.round((amount * feePercent) / 100);
  return { fee: toNaira(fee), payout: toNaira(amount - fee) };
}

/**
 * Split an amount into `portion` (`percent`%) and `remainder`.
 * Guarantees `portion + remainder === amount` to the kobo.
 */
export function splitByPercent(
  amountNaira: number,
  percent: number,
): { portion: number; remainder: number } {
  const amount = toKobo(amountNaira);
  const portion = Math.round((amount * percent) / 100);
  return { portion: toNaira(portion), remainder: toNaira(amount - portion) };
}

/** `percent`% of an amount, rounded to the nearest kobo. */
export function percentOf(amountNaira: number, percent: number): number {
  return toNaira(Math.round((toKobo(amountNaira) * percent) / 100));
}
