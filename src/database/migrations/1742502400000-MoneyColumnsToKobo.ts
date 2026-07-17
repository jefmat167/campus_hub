import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convert every money column from numeric(P,2) Naira to bigint kobo.
 *
 * Storage becomes exact integer kobo; the application still reads/writes Naira
 * via the KoboColumnTransformer on each entity column. Existing values are
 * multiplied by 100 (round guards against any stray sub-kobo test data).
 *
 * NOTE: raw SQL aggregations (e.g. admin financial stats) now return kobo and
 * divide by 100 in application code.
 */
export class MoneyColumnsToKobo1742502400000 implements MigrationInterface {
  name = 'MoneyColumnsToKobo1742502400000';

  // table, column, original numeric precision (for down), whether it had DEFAULT 0
  private readonly columns: ReadonlyArray<
    [table: string, column: string, precision: number, hasDefault: boolean]
  > = [
    ['wallets', 'balance', 12, true],
    ['wallets', 'lockedBalance', 12, true],
    ['wallet_transactions', 'amount', 12, false],
    ['wallet_transactions', 'balanceBefore', 12, false],
    ['wallet_transactions', 'balanceAfter', 12, false],
    ['listings', 'price', 12, false],
    ['offers', 'amount', 12, false],
    ['offers', 'counterAmount', 12, false],
    ['escrow_transactions', 'amount', 12, false],
    ['escrow_transactions', 'platformFee', 12, true],
    ['escrow_transactions', 'sellerPayout', 12, true],
    ['platform_wallet', 'balance', 14, true],
    ['platform_wallet_transactions', 'amount', 12, false],
    ['platform_wallet_transactions', 'balanceBefore', 14, false],
    ['platform_wallet_transactions', 'balanceAfter', 14, false],
    ['disputes', 'buyerRefundAmount', 12, false],
    ['disputes', 'sellerReleaseAmount', 12, false],
    ['housing_listings', 'price', 12, false],
    ['housing_listings', 'cautionFee', 12, false],
    ['housing_listings', 'agentFee', 12, false],
    ['roommate_profiles', 'budgetMin', 12, false],
    ['roommate_profiles', 'budgetMax', 12, false],
    ['buy_requests', 'budget_min', 12, false],
    ['buy_requests', 'budget_max', 12, false],
    ['buy_request_offers', 'proposed_price', 12, false],
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column, , hasDefault] of this.columns) {
      if (hasDefault) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`,
        );
      }
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE bigint USING round("${column}" * 100)::bigint`,
      );
      if (hasDefault) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT 0`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [table, column, precision, hasDefault] of [
      ...this.columns,
    ].reverse()) {
      if (hasDefault) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP DEFAULT`,
        );
      }
      await queryRunner.query(
        `ALTER TABLE "${table}" ALTER COLUMN "${column}" TYPE numeric(${precision},2) USING ("${column}" / 100.0)`,
      );
      if (hasDefault) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ALTER COLUMN "${column}" SET DEFAULT 0`,
        );
      }
    }
  }
}
