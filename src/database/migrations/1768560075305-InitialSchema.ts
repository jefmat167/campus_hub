import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1768560075305 implements MigrationInterface {
    name = 'InitialSchema1768560075305'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."disputes_reason_enum" AS ENUM('item_not_received', 'item_not_as_described', 'item_damaged', 'seller_unresponsive', 'buyer_unresponsive', 'payment_issue', 'fraud', 'other')`);
        await queryRunner.query(`CREATE TYPE "public"."disputes_status_enum" AS ENUM('open', 'under_review', 'resolved_buyer', 'resolved_seller', 'resolved_split', 'closed')`);
        await queryRunner.query(`CREATE TABLE "disputes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "escrow_id" uuid NOT NULL, "opened_by_id" uuid NOT NULL, "reason" "public"."disputes_reason_enum" NOT NULL, "description" text NOT NULL, "evidence" jsonb, "status" "public"."disputes_status_enum" NOT NULL DEFAULT 'open', "resolved_by_id" uuid, "resolution" text, "buyerRefundAmount" numeric(12,2), "sellerReleaseAmount" numeric(12,2), "resolvedAt" TIMESTAMP, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3c97580d01c1a4b0b345c42a107" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c621776068b60ee72409b89a92" ON "disputes" ("escrow_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_0ea46f4f2225f38d127063c367" ON "disputes" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_e3e36a382eb0855b0d4e765416" ON "disputes" ("status", "createdAt") `);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('user', 'moderator', 'admin', 'super_admin')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "role" "public"."users_role_enum" NOT NULL DEFAULT 'user'`);
        await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_c621776068b60ee72409b89a92b" FOREIGN KEY ("escrow_id") REFERENCES "escrow_transactions"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_fe0d2e90a128089ca7cf7cf5455" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "disputes" ADD CONSTRAINT "FK_46a6bddc5b940e568033271437a" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "disputes" DROP CONSTRAINT "FK_46a6bddc5b940e568033271437a"`);
        await queryRunner.query(`ALTER TABLE "disputes" DROP CONSTRAINT "FK_fe0d2e90a128089ca7cf7cf5455"`);
        await queryRunner.query(`ALTER TABLE "disputes" DROP CONSTRAINT "FK_c621776068b60ee72409b89a92b"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "role"`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e3e36a382eb0855b0d4e765416"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0ea46f4f2225f38d127063c367"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c621776068b60ee72409b89a92"`);
        await queryRunner.query(`DROP TABLE "disputes"`);
        await queryRunner.query(`DROP TYPE "public"."disputes_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."disputes_reason_enum"`);
    }

}
