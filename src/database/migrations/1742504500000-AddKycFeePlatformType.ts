import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a 'kyc_fee' value to the platform-wallet transaction type enum so the
 * one-time ₦100 BVN/NIN (Tier 2) verification fee is booked to the platform
 * wallet like every other fee, instead of vanishing from the user's balance
 * with no ledger entry on either side.
 *
 * Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction).
 * Removing an enum value is not supported by Postgres, so down() is a no-op.
 */
export class AddKycFeePlatformType1742504500000 implements MigrationInterface {
  name = 'AddKycFeePlatformType1742504500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "platform_transaction_type_enum" ADD VALUE IF NOT EXISTS 'kyc_fee'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value without recreating the type; no-op.
  }
}
