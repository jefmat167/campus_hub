import { MigrationInterface, QueryRunner } from 'typeorm';

export class BuyerOnlyReviews1742500600000 implements MigrationInterface {
  name = 'BuyerOnlyReviews1742500600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the composite index that includes `type`
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reviews_reviewee_id_type_createdAt"`,
    );

    // Drop the existing unique constraint that includes `type`
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_escrow_reviewer_type"`,
    );

    // Drop the `type` column
    await queryRunner.query(`ALTER TABLE "reviews" DROP COLUMN "type"`);

    // Drop the `review_type_enum` type if it exists
    await queryRunner.query(`DROP TYPE IF EXISTS "review_type_enum"`);

    // Add new unique constraint: one review per buyer per escrow transaction
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "UQ_reviews_escrow_reviewer" UNIQUE ("escrow_transaction_id", "reviewer_id")`,
    );

    // Recreate composite index without `type`
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_reviewee_id_createdAt" ON "reviews" ("reviewee_id", "createdAt")`,
    );

    // Drop buyer rating columns on users (not needed in buyer-only review model)
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "buyerRating"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "buyerRatingCount"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore buyer rating columns on users
    await queryRunner.query(
      `ALTER TABLE "users" ADD "buyerRatingCount" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "buyerRating" numeric(3,2) NOT NULL DEFAULT 0`,
    );

    // Drop new index and unique constraint
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reviews_reviewee_id_createdAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT IF EXISTS "UQ_reviews_escrow_reviewer"`,
    );

    // Recreate `type` enum and column
    await queryRunner.query(
      `CREATE TYPE "review_type_enum" AS ENUM ('buyer_to_seller', 'seller_to_buyer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD "type" "review_type_enum" NOT NULL DEFAULT 'buyer_to_seller'`,
    );
    // Drop default after backfill
    await queryRunner.query(
      `ALTER TABLE "reviews" ALTER COLUMN "type" DROP DEFAULT`,
    );

    // Restore old composite index and unique constraint
    await queryRunner.query(
      `CREATE INDEX "IDX_reviews_reviewee_id_type_createdAt" ON "reviews" ("reviewee_id", "type", "createdAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "UQ_reviews_escrow_reviewer_type" UNIQUE ("escrow_transaction_id", "reviewer_id", "type")`,
    );
  }
}
