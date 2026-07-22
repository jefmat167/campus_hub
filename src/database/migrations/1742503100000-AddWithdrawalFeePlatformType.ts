import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a 'withdrawal_fee' value to the platform-wallet transaction type enum so
 * the platform's cut of a wallet withdrawal can be booked to the platform
 * wallet (monetisation), alongside the existing escrow/cancellation fees.
 *
 * Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction).
 * Removing an enum value is not supported by Postgres, so down() is a no-op.
 */
export class AddWithdrawalFeePlatformType1742503100000
  implements MigrationInterface
{
  name = 'AddWithdrawalFeePlatformType1742503100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "platform_transaction_type_enum" ADD VALUE IF NOT EXISTS 'withdrawal_fee'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value without recreating the type; no-op.
  }
}
