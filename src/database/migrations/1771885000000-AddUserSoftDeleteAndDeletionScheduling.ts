import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUserSoftDeleteAndDeletionScheduling1771885000000 implements MigrationInterface {
    name = 'AddUserSoftDeleteAndDeletionScheduling1771885000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // From AddUserSoftDelete1771850632314
        await queryRunner.query(`ALTER TABLE "users" ADD "isDeleted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deletedAt" TIMESTAMP`);
        await queryRunner.query(`CREATE INDEX "IDX_fb21a8f1ce1641e7328f36968b" ON "users" ("isDeleted") `);

        // From AddUserDeletionScheduling1771880745567
        await queryRunner.query(`ALTER TABLE "users" ADD "isDeactivated" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "scheduledDeletionAt" TIMESTAMP`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9377f4bcd6fb0f278ef8cb2aa0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c8cff04392e91fbe358d0b316a"`);
        await queryRunner.query(`ALTER TYPE "public"."roommate_profiles_status_enum" RENAME TO "roommate_profiles_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."roommate_profiles_status_enum" AS ENUM('active', 'paused', 'matched', 'deleted')`);
        await queryRunner.query(`ALTER TABLE "roommate_profiles" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roommate_profiles" ALTER COLUMN "status" TYPE "public"."roommate_profiles_status_enum" USING "status"::"text"::"public"."roommate_profiles_status_enum"`);
        await queryRunner.query(`ALTER TABLE "roommate_profiles" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."roommate_profiles_status_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_dc6e331be0c7530215ba716daf" ON "users" ("scheduledDeletionAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_9377f4bcd6fb0f278ef8cb2aa0" ON "roommate_profiles" ("gender", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_c8cff04392e91fbe358d0b316a" ON "roommate_profiles" ("university_id", "status") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Reverse of AddUserDeletionScheduling1771880745567
        await queryRunner.query(`DROP INDEX "public"."IDX_c8cff04392e91fbe358d0b316a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_9377f4bcd6fb0f278ef8cb2aa0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc6e331be0c7530215ba716daf"`);
        await queryRunner.query(`CREATE TYPE "public"."roommate_profiles_status_enum_old" AS ENUM('active', 'paused', 'matched')`);
        await queryRunner.query(`ALTER TABLE "roommate_profiles" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "roommate_profiles" ALTER COLUMN "status" TYPE "public"."roommate_profiles_status_enum_old" USING "status"::"text"::"public"."roommate_profiles_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "roommate_profiles" ALTER COLUMN "status" SET DEFAULT 'active'`);
        await queryRunner.query(`DROP TYPE "public"."roommate_profiles_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."roommate_profiles_status_enum_old" RENAME TO "roommate_profiles_status_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_c8cff04392e91fbe358d0b316a" ON "roommate_profiles" ("status", "university_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_9377f4bcd6fb0f278ef8cb2aa0" ON "roommate_profiles" ("gender", "status") `);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "scheduledDeletionAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isDeactivated"`);

        // Reverse of AddUserSoftDelete1771850632314
        await queryRunner.query(`DROP INDEX "public"."IDX_fb21a8f1ce1641e7328f36968b"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isDeleted"`);
    }

}
