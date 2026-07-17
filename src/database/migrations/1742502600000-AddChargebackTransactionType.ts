import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a 'chargeback' value to the wallet transaction type enum, used when a
 * card deposit is clawed back after a Paystack dispute/refund.
 *
 * Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction).
 * Removing an enum value is not supported by Postgres, so down() is a no-op.
 */
export class AddChargebackTransactionType1742502600000
  implements MigrationInterface
{
  name = 'AddChargebackTransactionType1742502600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "wallet_transaction_type_enum" ADD VALUE IF NOT EXISTS 'chargeback'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value without recreating the type; no-op.
  }
}
