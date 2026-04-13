import { MigrationInterface, QueryRunner } from 'typeorm';

export class HousingOverhaul1742500700000 implements MigrationInterface {
  name = 'HousingOverhaul1742500700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Wipe existing housing data (dev environment).
    // Conversations referencing these listings will have housing_listing_id set to NULL
    // (FK is ON DELETE SET NULL in the conversation entity).
    await queryRunner.query(`DELETE FROM "housing_listings"`);

    // --- 1. Rename landlord_id -> poster_id ---------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" DROP CONSTRAINT IF EXISTS "FK_housing_listings_landlord_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_listings_landlord_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_listings_landlord_id_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" RENAME COLUMN "landlord_id" TO "poster_id"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_listings_poster_id" ON "housing_listings" ("poster_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_listings_poster_id_status" ON "housing_listings" ("poster_id", "status")`,
    );
    await queryRunner.query(`
      ALTER TABLE "housing_listings"
      ADD CONSTRAINT "FK_housing_listings_poster_id"
      FOREIGN KEY ("poster_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

    // --- 2. Drop verification fields (not needed in peer handoff model) -----
    await queryRunner.query(
      `ALTER TABLE "housing_listings" DROP COLUMN "isVerified"`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" DROP COLUMN "verifiedAt"`,
    );

    // --- 3. Add poster_relationship enum + column ---------------------------
    await queryRunner.query(
      `CREATE TYPE "poster_relationship_enum" AS ENUM ('current_tenant', 'past_tenant', 'knows_landlord')`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ADD "posterRelationship" "poster_relationship_enum" NOT NULL`,
    );

    // --- 4. Add expiresAt + reportCount ------------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ADD "expiresAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_listings_expiresAt" ON "housing_listings" ("expiresAt")`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ADD "reportCount" integer NOT NULL DEFAULT 0`,
    );

    // --- 5. videoUrl: jsonb -> varchar(500) ---------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "videoUrl" TYPE varchar(500) USING NULL`,
    );

    // --- 6. Replace housing_status_enum (rented->taken, add expired/under_review) ---
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "housing_status_enum"`);
    await queryRunner.query(
      `CREATE TYPE "housing_status_enum" AS ENUM ('available', 'taken', 'reserved', 'paused', 'under_review', 'expired', 'deleted')`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" TYPE "housing_status_enum" USING "status"::"housing_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" SET DEFAULT 'available'`,
    );

    // --- 7. housing_reports table + enum ------------------------------------
    await queryRunner.query(
      `CREATE TYPE "housing_report_reason_enum" AS ENUM ('fake_listing', 'misleading', 'already_taken', 'inappropriate', 'other')`,
    );
    await queryRunner.query(`
      CREATE TABLE "housing_reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "reporter_id" uuid NOT NULL,
        "reason" "housing_report_reason_enum" NOT NULL,
        "details" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_housing_reports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_housing_reports_listing_reporter" UNIQUE ("listing_id", "reporter_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_reports_listing_id" ON "housing_reports" ("listing_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_reports_reporter_id" ON "housing_reports" ("reporter_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_reports_listing_id_createdAt" ON "housing_reports" ("listing_id", "createdAt")`,
    );
    await queryRunner.query(`
      ALTER TABLE "housing_reports"
      ADD CONSTRAINT "FK_housing_reports_listing_id"
      FOREIGN KEY ("listing_id")
      REFERENCES "housing_listings"("id")
      ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "housing_reports"
      ADD CONSTRAINT "FK_housing_reports_reporter_id"
      FOREIGN KEY ("reporter_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // --- housing_reports teardown ------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_reports" DROP CONSTRAINT IF EXISTS "FK_housing_reports_reporter_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_reports" DROP CONSTRAINT IF EXISTS "FK_housing_reports_listing_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_reports_listing_id_createdAt"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_reports_reporter_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_reports_listing_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "housing_reports"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "housing_report_reason_enum"`);

    // --- Wipe listings again (status rollback needs a clean slate) ---------
    await queryRunner.query(`DELETE FROM "housing_listings"`);

    // --- Revert housing_status_enum ----------------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "housing_status_enum"`);
    await queryRunner.query(
      `CREATE TYPE "housing_status_enum" AS ENUM ('available', 'rented', 'reserved', 'paused', 'deleted')`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" TYPE "housing_status_enum" USING "status"::"housing_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "status" SET DEFAULT 'available'`,
    );

    // --- videoUrl: varchar -> jsonb ----------------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ALTER COLUMN "videoUrl" TYPE jsonb USING NULL`,
    );

    // --- Drop reportCount + expiresAt --------------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" DROP COLUMN "reportCount"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_listings_expiresAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" DROP COLUMN "expiresAt"`,
    );

    // --- Drop posterRelationship -------------------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" DROP COLUMN "posterRelationship"`,
    );
    await queryRunner.query(`DROP TYPE "poster_relationship_enum"`);

    // --- Restore isVerified / verifiedAt -----------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ADD "verifiedAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" ADD "isVerified" boolean NOT NULL DEFAULT false`,
    );

    // --- Rename poster_id -> landlord_id -----------------------------------
    await queryRunner.query(
      `ALTER TABLE "housing_listings" DROP CONSTRAINT IF EXISTS "FK_housing_listings_poster_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_listings_poster_id_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_housing_listings_poster_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "housing_listings" RENAME COLUMN "poster_id" TO "landlord_id"`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_listings_landlord_id" ON "housing_listings" ("landlord_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_housing_listings_landlord_id_status" ON "housing_listings" ("landlord_id", "status")`,
    );
    await queryRunner.query(`
      ALTER TABLE "housing_listings"
      ADD CONSTRAINT "FK_housing_listings_landlord_id"
      FOREIGN KEY ("landlord_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);
  }
}
