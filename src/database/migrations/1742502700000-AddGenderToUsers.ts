import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add the required `gender` column to users. Registration now collects gender
 * (male/female), but existing users predate the field.
 *
 * Strategy for a table that already has rows: add the column NOT NULL with a
 * temporary DEFAULT so existing rows are backfilled, then drop the default so
 * new inserts must supply a value explicitly (the app always does).
 *
 * Existing rows are backfilled to 'male'; correct any specific user afterwards
 * with:  UPDATE "users" SET "gender" = 'female' WHERE id = '...';
 *
 * Reuses the existing "gender_enum" type (created for roommate_profiles).
 */
export class AddGenderToUsers1742502700000 implements MigrationInterface {
  name = 'AddGenderToUsers1742502700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "gender" "gender_enum" NOT NULL DEFAULT 'male'`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "gender" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "gender"`);
  }
}
