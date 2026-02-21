import { MigrationInterface, QueryRunner } from "typeorm";

export class ReplaceHousingPriceFields1771685527063 implements MigrationInterface {
    name = 'ReplaceHousingPriceFields1771685527063'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop old index
        await queryRunner.query(`DROP INDEX "public"."IDX_c81a9fa1b16e8a94faa7ffa49f"`);

        // Create enum type
        await queryRunner.query(`CREATE TYPE "public"."housing_listings_paymentfrequency_enum" AS ENUM('monthly', 'quarterly', 'yearly')`);

        // Add new columns with defaults for existing data
        await queryRunner.query(`ALTER TABLE "housing_listings" ADD "price" numeric(12,2)`);
        await queryRunner.query(`ALTER TABLE "housing_listings" ADD "paymentFrequency" "public"."housing_listings_paymentfrequency_enum"`);

        // Migrate existing data: copy pricePerMonth to price, set paymentFrequency to 'yearly'
        // Use COALESCE to handle any NULL values in pricePerMonth
        await queryRunner.query(`UPDATE "housing_listings" SET "price" = COALESCE("pricePerMonth", 0), "paymentFrequency" = 'yearly'`);

        // Make columns NOT NULL after data migration
        await queryRunner.query(`ALTER TABLE "housing_listings" ALTER COLUMN "price" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "housing_listings" ALTER COLUMN "paymentFrequency" SET NOT NULL`);

        // Drop old columns
        await queryRunner.query(`ALTER TABLE "housing_listings" DROP COLUMN "pricePerMonth"`);
        await queryRunner.query(`ALTER TABLE "housing_listings" DROP COLUMN "pricePerYear"`);

        // Create new index
        await queryRunner.query(`CREATE INDEX "IDX_f137849b5e46f7382f17fa4085" ON "housing_listings" ("price", "status")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop new index
        await queryRunner.query(`DROP INDEX "public"."IDX_f137849b5e46f7382f17fa4085"`);

        // Add back old columns
        await queryRunner.query(`ALTER TABLE "housing_listings" ADD "pricePerMonth" numeric(12,2)`);
        await queryRunner.query(`ALTER TABLE "housing_listings" ADD "pricePerYear" numeric(12,2)`);

        // Migrate data back: copy price to pricePerMonth
        await queryRunner.query(`UPDATE "housing_listings" SET "pricePerMonth" = "price"`);

        // Make pricePerMonth NOT NULL
        await queryRunner.query(`ALTER TABLE "housing_listings" ALTER COLUMN "pricePerMonth" SET NOT NULL`);

        // Drop new columns
        await queryRunner.query(`ALTER TABLE "housing_listings" DROP COLUMN "paymentFrequency"`);
        await queryRunner.query(`ALTER TABLE "housing_listings" DROP COLUMN "price"`);

        // Drop enum type
        await queryRunner.query(`DROP TYPE "public"."housing_listings_paymentfrequency_enum"`);

        // Recreate old index
        await queryRunner.query(`CREATE INDEX "IDX_c81a9fa1b16e8a94faa7ffa49f" ON "housing_listings" ("pricePerMonth", "status")`);
    }

}
