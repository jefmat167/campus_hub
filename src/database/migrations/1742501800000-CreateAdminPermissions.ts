import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminPermissions1742501800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "admin_permissions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "permission" varchar(50) NOT NULL,
        "granted_by" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_permissions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_admin_permissions_user_perm" UNIQUE ("user_id", "permission"),
        CONSTRAINT "FK_admin_permissions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_admin_permissions_granter" FOREIGN KEY ("granted_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_admin_permissions_user_id" ON "admin_permissions" ("user_id")
    `);

    // Add new audit action enum values
    await queryRunner.query(`ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'admin_create'`);
    await queryRunner.query(`ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'admin_promote'`);
    await queryRunner.query(`ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'admin_permission_grant'`);
    await queryRunner.query(`ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'admin_permission_revoke'`);
    await queryRunner.query(`ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'admin_demote'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_admin_permissions_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_permissions"`);
    // Note: PostgreSQL does not support removing enum values
  }
}
