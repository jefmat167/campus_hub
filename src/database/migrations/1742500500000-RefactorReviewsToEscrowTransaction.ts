import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefactorReviewsToEscrowTransaction1742500500000
  implements MigrationInterface
{
  name = 'RefactorReviewsToEscrowTransaction1742500500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Existing rows point at offer IDs which won't match escrow_transactions.id.
    // Dev environment — wipe reviews for a clean slate before repointing the FK.
    await queryRunner.query(`DELETE FROM "reviews"`);

    // Drop old unique constraint and indexes that reference transaction_id
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_transaction_reviewer_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reviews_transaction_id"`,
    );

    // Rename the column
    await queryRunner.query(
      `ALTER TABLE "reviews" RENAME COLUMN "transaction_id" TO "escrow_transaction_id"`,
    );

    // Recreate index + unique constraint under new name
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_escrow_transaction_id" ON "reviews" ("escrow_transaction_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "UQ_reviews_escrow_reviewer_type" UNIQUE ("escrow_transaction_id", "reviewer_id", "type")`,
    );

    // Add FK to escrow_transactions
    await queryRunner.query(
      `ALTER TABLE "reviews"
       ADD CONSTRAINT "FK_reviews_escrow_transaction_id"
       FOREIGN KEY ("escrow_transaction_id")
       REFERENCES "escrow_transactions"("id")
       ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop FK and new constraints/indexes
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "FK_reviews_escrow_transaction_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_escrow_reviewer_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reviews_escrow_transaction_id"`,
    );

    // Rename column back
    await queryRunner.query(
      `ALTER TABLE "reviews" RENAME COLUMN "escrow_transaction_id" TO "transaction_id"`,
    );

    // Recreate original index + unique constraint
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_transaction_id" ON "reviews" ("transaction_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "UQ_reviews_transaction_reviewer_type" UNIQUE ("transaction_id", "reviewer_id", "type")`,
    );
  }
}
