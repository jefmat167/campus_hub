import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminAuditLog1742500900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enums
    await queryRunner.query(`
      CREATE TYPE "audit_action_enum" AS ENUM (
        'user_role_change', 'user_ban', 'user_unban', 'user_tier_change',
        'user_force_logout', 'wallet_credit', 'wallet_debit',
        'listing_takedown', 'post_hide', 'post_unhide', 'comment_delete',
        'university_create', 'university_update', 'university_deactivate', 'university_activate',
        'faculty_create', 'faculty_update', 'faculty_deactivate',
        'department_create', 'department_update', 'department_deactivate',
        'housing_takedown', 'report_review', 'appeal_review'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "audit_target_type_enum" AS ENUM (
        'user', 'listing', 'post', 'comment', 'housing_listing',
        'university', 'faculty', 'department', 'wallet', 'escrow',
        'report', 'appeal'
      )
    `);

    // Create table
    await queryRunner.query(`
      CREATE TABLE "admin_audit_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "admin_id" uuid NOT NULL,
        "action" "audit_action_enum" NOT NULL,
        "target_type" "audit_target_type_enum" NOT NULL,
        "target_id" varchar NOT NULL,
        "reason" text,
        "metadata" jsonb,
        "ip_address" varchar(45),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_admin_audit_logs_admin" FOREIGN KEY ("admin_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes
    await queryRunner.query(`CREATE INDEX "IDX_audit_admin_id" ON "admin_audit_logs" ("admin_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_admin_created" ON "admin_audit_logs" ("admin_id", "createdAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_target" ON "admin_audit_logs" ("target_type", "target_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_action_created" ON "admin_audit_logs" ("action", "createdAt")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "admin_audit_logs"`);
    await queryRunner.query(`DROP TYPE "audit_action_enum"`);
    await queryRunner.query(`DROP TYPE "audit_target_type_enum"`);
  }
}
