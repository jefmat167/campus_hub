import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace rev-2, Phase 1 — identity & vendor onboarding (spec 01.5 / 03.1).
 *
 * 1. Academic affiliation becomes optional at the account level: the four
 *    student-identity columns on `users` (university/faculty/department/gender)
 *    drop NOT NULL, and `account_type` ('student' | 'vendor', varchar so new
 *    kinds never need an ALTER TYPE) is added. Existing rows default to
 *    'student' — zero behaviour change for them.
 * 2. `vendor_profiles` — vendor status is a profile attached to the one user
 *    account (never a second login/wallet). Lifecycle:
 *    draft → pending_review → active | rejected, active ⇄ suspended.
 *    `shopfront_photo_url` is nullable because Door-2 registration happens
 *    before the account can upload — the photo arrives via the authed
 *    "submit for review" step (mirrors how Tier-1 student docs work).
 * 3. `vendor_universities` — the 1–3 campuses a vendor serves (invariants
 *    "1–3 rows" and "home ∈ served" are service-enforced).
 *
 * Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction).
 */
export class OptionalAcademicIdentityAndVendors1742503700000
  implements MigrationInterface
{
  name = 'OptionalAcademicIdentityAndVendors1742503700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "university_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "faculty_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "department_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "gender" DROP NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "account_type" character varying(20) NOT NULL DEFAULT 'student'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_account_type" ON "users" ("account_type")`,
    );

    await queryRunner.query(`
      CREATE TABLE "vendor_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "business_name" character varying(255) NOT NULL,
        "description" text,
        "home_university_id" uuid NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "shopfront_photo_url" character varying(500),
        "photo_captured_live" boolean NOT NULL DEFAULT false,
        "cac_number" character varying(50),
        "cac_document_url" character varying(500),
        "is_verified" boolean NOT NULL DEFAULT false,
        "rejection_reason" text,
        "suspension_reason" text,
        "reviewed_by" character varying(255),
        "reviewed_at" TIMESTAMPTZ,
        "submitted_at" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vendor_profiles_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_vendor_profiles_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_vendor_profiles_home_university" FOREIGN KEY ("home_university_id")
          REFERENCES "universities"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_profiles_status" ON "vendor_profiles" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_profiles_home_university" ON "vendor_profiles" ("home_university_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "vendor_universities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendor_profile_id" uuid NOT NULL,
        "university_id" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_universities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vendor_universities_pair" UNIQUE ("vendor_profile_id", "university_id"),
        CONSTRAINT "FK_vendor_universities_profile" FOREIGN KEY ("vendor_profile_id")
          REFERENCES "vendor_profiles"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_universities_university" FOREIGN KEY ("university_id")
          REFERENCES "universities"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_universities_university" ON "vendor_universities" ("university_id")`,
    );

    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'vendor_approve'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'vendor_reject'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'vendor_suspend'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'vendor_reactivate'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'vendor_cac_verify'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_universities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_profiles"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_account_type"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "account_type"`,
    );
    // Re-adding NOT NULL fails if vendor accounts (NULL academics) still
    // exist — remove those rows manually first. Enum values are left behind.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "university_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "faculty_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "department_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "gender" SET NOT NULL`,
    );
  }
}
