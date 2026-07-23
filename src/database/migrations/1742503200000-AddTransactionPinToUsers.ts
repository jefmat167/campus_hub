import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transaction PIN: a user-set 6-digit credential (bcrypt-hashed) required for
 * money-out actions, with a failed-attempt lockout. All columns are nullable /
 * defaulted, so existing rows need no backfill (a user simply has no PIN until
 * they set one, and is then blocked from transacting until they do).
 */
export class AddTransactionPinToUsers1742503200000
  implements MigrationInterface
{
  name = 'AddTransactionPinToUsers1742503200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "pinHash" character varying(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "pinAttempts" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "pinLockedUntil" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pinLockedUntil"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pinAttempts"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "pinHash"`);
  }
}
