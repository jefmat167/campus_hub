import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anti-brute-force lockout for delivery-code verification. The code is only 4
 * digits (~9k values), so cap wrong guesses: after 5 failures the code is
 * locked for a cooldown. Adds a wrong-attempt counter and a lock timestamp to
 * `delivery_codes` (both nullable/defaulted — no backfill needed).
 */
export class AddDeliveryCodeVerifyLockout1742503300000
  implements MigrationInterface
{
  name = 'AddDeliveryCodeVerifyLockout1742503300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "delivery_codes" ADD COLUMN "verifyAttempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_codes" ADD COLUMN "lockedUntil" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "delivery_codes" DROP COLUMN "lockedUntil"`);
    await queryRunner.query(`ALTER TABLE "delivery_codes" DROP COLUMN "verifyAttempts"`);
  }
}
