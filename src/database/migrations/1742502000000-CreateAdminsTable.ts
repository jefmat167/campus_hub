import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminsTable1742502000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create admin_role enum
    await queryRunner.query(`
      CREATE TYPE "admin_role_enum" AS ENUM ('admin', 'super_admin')
    `);

    // 2. Create admins table
    await queryRunner.query(`
      CREATE TABLE "admins" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "full_name" varchar(255) NOT NULL,
        "role" "admin_role_enum" NOT NULL DEFAULT 'admin',
        "refresh_token_hash" varchar(255),
        "is_active" boolean NOT NULL DEFAULT true,
        "last_login_at" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admins" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admins_email" UNIQUE ("email")
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_admins_email" ON "admins" ("email")`);

    // 3. Migrate existing admin/super_admin users to admins table
    await queryRunner.query(`
      INSERT INTO "admins" ("id", "email", "password_hash", "full_name", "role", "refresh_token_hash", "last_login_at", "createdAt", "updatedAt")
      SELECT "id", "email", "passwordHash", "fullName",
        CASE WHEN "role" = 'super_admin' THEN 'super_admin'::"admin_role_enum" ELSE 'admin'::"admin_role_enum" END,
        "refreshTokenHash", "lastLoginAt", "createdAt", "updatedAt"
      FROM "users" WHERE "role" IN ('admin', 'super_admin')
    `);

    // 4. Update admin_permissions: rename user_id to admin_id, repoint FKs
    await queryRunner.query(`ALTER TABLE "admin_permissions" DROP CONSTRAINT IF EXISTS "FK_admin_permissions_user"`);
    await queryRunner.query(`ALTER TABLE "admin_permissions" DROP CONSTRAINT IF EXISTS "FK_admin_permissions_granter"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_permissions_user_id"`);
    await queryRunner.query(`ALTER TABLE "admin_permissions" DROP CONSTRAINT IF EXISTS "UQ_admin_permissions_user_perm"`);

    await queryRunner.query(`ALTER TABLE "admin_permissions" RENAME COLUMN "user_id" TO "admin_id"`);

    await queryRunner.query(`
      ALTER TABLE "admin_permissions"
        ADD CONSTRAINT "UQ_admin_permissions_admin_perm" UNIQUE ("admin_id", "permission")
    `);
    await queryRunner.query(`CREATE INDEX "IDX_admin_permissions_admin_id" ON "admin_permissions" ("admin_id")`);
    await queryRunner.query(`
      ALTER TABLE "admin_permissions"
        ADD CONSTRAINT "FK_admin_permissions_admin" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "admin_permissions"
        ADD CONSTRAINT "FK_admin_permissions_granter" FOREIGN KEY ("granted_by") REFERENCES "admins"("id") ON DELETE SET NULL
    `);

    // 5. Update admin_audit_logs: repoint FK to admins
    await queryRunner.query(`ALTER TABLE "admin_audit_logs" DROP CONSTRAINT IF EXISTS "FK_admin_audit_logs_admin"`);
    await queryRunner.query(`
      ALTER TABLE "admin_audit_logs"
        ADD CONSTRAINT "FK_admin_audit_logs_admin" FOREIGN KEY ("admin_id") REFERENCES "admins"("id") ON DELETE SET NULL
    `);

    // 6. Remove admin:manage permission rows (no longer a grantable permission)
    await queryRunner.query(`DELETE FROM "admin_permissions" WHERE "permission" = 'admin:manage'`);

    // 6b. Add new audit enum values
    await queryRunner.query(`ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'admin_deactivate'`);
    await queryRunner.query(`ALTER TYPE "audit_target_type_enum" ADD VALUE IF NOT EXISTS 'admin'`);

    // 7. Delete migrated admin/super_admin users from users table and their wallets
    await queryRunner.query(`
      DELETE FROM "wallets" WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" IN ('admin', 'super_admin'))
    `);
    await queryRunner.query(`DELETE FROM "users" WHERE "role" IN ('admin', 'super_admin')`);

    // 8. Update any remaining moderator users to 'user' role
    await queryRunner.query(`UPDATE "users" SET "role" = 'user' WHERE "role" = 'moderator'`);

    // 9. Recreate user_role enum with only 'user'
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "user_role_enum" RENAME TO "user_role_enum_old"`);
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('user')`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_enum" USING "role"::text::"user_role_enum"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'::"user_role_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum_old"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore user_role enum with all values
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "user_role_enum" RENAME TO "user_role_enum_old"`);
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('user', 'moderator', 'admin', 'super_admin')`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_enum" USING "role"::text::"user_role_enum"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'::"user_role_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum_old"`);

    // Revert admin_audit_logs FK
    await queryRunner.query(`ALTER TABLE "admin_audit_logs" DROP CONSTRAINT IF EXISTS "FK_admin_audit_logs_admin"`);
    await queryRunner.query(`
      ALTER TABLE "admin_audit_logs"
        ADD CONSTRAINT "FK_admin_audit_logs_admin" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Revert admin_permissions: rename admin_id back to user_id, repoint FKs
    await queryRunner.query(`ALTER TABLE "admin_permissions" DROP CONSTRAINT IF EXISTS "FK_admin_permissions_admin"`);
    await queryRunner.query(`ALTER TABLE "admin_permissions" DROP CONSTRAINT IF EXISTS "FK_admin_permissions_granter"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_permissions_admin_id"`);
    await queryRunner.query(`ALTER TABLE "admin_permissions" DROP CONSTRAINT IF EXISTS "UQ_admin_permissions_admin_perm"`);

    await queryRunner.query(`ALTER TABLE "admin_permissions" RENAME COLUMN "admin_id" TO "user_id"`);

    await queryRunner.query(`
      ALTER TABLE "admin_permissions"
        ADD CONSTRAINT "UQ_admin_permissions_user_perm" UNIQUE ("user_id", "permission")
    `);
    await queryRunner.query(`CREATE INDEX "IDX_admin_permissions_user_id" ON "admin_permissions" ("user_id")`);
    await queryRunner.query(`
      ALTER TABLE "admin_permissions"
        ADD CONSTRAINT "FK_admin_permissions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "admin_permissions"
        ADD CONSTRAINT "FK_admin_permissions_granter" FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE SET NULL
    `);

    // Drop admins table and enum
    await queryRunner.query(`DROP TABLE IF EXISTS "admins"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "admin_role_enum"`);
  }
}
