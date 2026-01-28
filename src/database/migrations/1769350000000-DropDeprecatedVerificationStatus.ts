import { MigrationInterface, QueryRunner } from "typeorm";

export class DropDeprecatedVerificationStatus1769350000000 implements MigrationInterface {
    name = 'DropDeprecatedVerificationStatus1769350000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Drop index on verification_status
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_verification_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_users_verification_status"`);

        // Also try to drop any auto-generated index name patterns
        const indexes = await queryRunner.query(`
            SELECT indexname FROM pg_indexes
            WHERE tablename = 'users'
            AND indexdef LIKE '%verification_status%'
        `);

        for (const idx of indexes) {
            await queryRunner.query(`DROP INDEX IF EXISTS "${idx.indexname}"`);
        }

        // Drop the deprecated columns
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "verification_status"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "verification_reviewed_at"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "verification_reviewed_by"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "verification_rejection_reason"`);

        // Drop the enum type
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_verification_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."users_verificationstatus_enum"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Recreate the enum type
        await queryRunner.query(`CREATE TYPE "public"."users_verification_status_enum" AS ENUM('pending', 'under_review', 'verified', 'rejected')`);

        // Recreate the columns
        await queryRunner.query(`ALTER TABLE "users" ADD "verification_status" "public"."users_verification_status_enum" NOT NULL DEFAULT 'pending'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "verification_reviewed_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "users" ADD "verification_reviewed_by" character varying(255)`);
        await queryRunner.query(`ALTER TABLE "users" ADD "verification_rejection_reason" text`);

        // Recreate the index
        await queryRunner.query(`CREATE INDEX "IDX_users_verification_status" ON "users" ("verification_status")`);
    }
}
