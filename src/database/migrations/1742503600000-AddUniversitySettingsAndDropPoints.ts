import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace rev-2, Phase 0 — per-university settings + drop points
 * (design spec 01.3 / 04.1).
 *
 * Creates `university_settings` (one optional row per university; every column
 * nullable, NULL = "no override, use the platform default") and `drop_points`
 * (admin-curated public handover locations, used by vendor delivery from
 * Phase 5).
 *
 * Absorbs the existing per-university cancellation-fee columns: rows whose
 * values deviate from the old column defaults (10 / true) are copied into
 * `university_settings`, then `universities.cancellationFeePercent` and
 * `.cancellationFeeEnabled` are dropped. Effective behaviour is unchanged —
 * the defaults now live in UniversitySettingsService instead of the column
 * definitions.
 *
 * Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction).
 */
export class AddUniversitySettingsAndDropPoints1742503600000
  implements MigrationInterface
{
  name = 'AddUniversitySettingsAndDropPoints1742503600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "university_settings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "university_id" uuid NOT NULL,
        "p2p_fee_percent" numeric(5,2),
        "vendor_fee_percent" numeric(5,2),
        "cancellation_fee_percent" numeric(5,2),
        "cancellation_fee_enabled" boolean,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_university_settings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_university_settings_university" UNIQUE ("university_id"),
        CONSTRAINT "FK_university_settings_university" FOREIGN KEY ("university_id")
          REFERENCES "universities"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_university_settings_university_id"
      ON "university_settings" ("university_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "drop_points" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "university_id" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "directions" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_drop_points" PRIMARY KEY ("id"),
        CONSTRAINT "FK_drop_points_university" FOREIGN KEY ("university_id")
          REFERENCES "universities"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_drop_points_university_id" ON "drop_points" ("university_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_drop_points_university_active"
      ON "drop_points" ("university_id", "is_active")
    `);

    // Preserve real per-university cancellation overrides (rows still at the
    // old column defaults need no settings row — the service defaults cover them).
    await queryRunner.query(`
      INSERT INTO "university_settings"
        ("university_id", "cancellation_fee_percent", "cancellation_fee_enabled")
      SELECT "id", "cancellationFeePercent", "cancellationFeeEnabled"
      FROM "universities"
      WHERE "cancellationFeePercent" IS DISTINCT FROM 10
         OR "cancellationFeeEnabled" IS DISTINCT FROM true
    `);

    await queryRunner.query(
      `ALTER TABLE "universities" DROP COLUMN "cancellationFeePercent"`,
    );
    await queryRunner.query(
      `ALTER TABLE "universities" DROP COLUMN "cancellationFeeEnabled"`,
    );

    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'university_settings_update'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'drop_point_create'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'drop_point_update'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the old columns with their historical defaults, then copy any
    // overrides back from the settings rows before dropping the new tables.
    await queryRunner.query(
      `ALTER TABLE "universities" ADD COLUMN "cancellationFeePercent" numeric(5,2) NOT NULL DEFAULT 10`,
    );
    await queryRunner.query(
      `ALTER TABLE "universities" ADD COLUMN "cancellationFeeEnabled" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(`
      UPDATE "universities" u
      SET "cancellationFeePercent" = COALESCE(s."cancellation_fee_percent", 10),
          "cancellationFeeEnabled" = COALESCE(s."cancellation_fee_enabled", true)
      FROM "university_settings" s
      WHERE s."university_id" = u."id"
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "drop_points"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "university_settings"`);
    // Postgres cannot drop enum values without recreating the type; the three
    // audit_action_enum values added in up() are left behind (harmless).
  }
}
