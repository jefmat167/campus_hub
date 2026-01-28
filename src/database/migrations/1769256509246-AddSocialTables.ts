import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSocialTables1769256509246 implements MigrationInterface {
    name = 'AddSocialTables1769256509246'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."posts_visibility_enum" AS ENUM('university', 'faculty', 'department')`);
        await queryRunner.query(`CREATE TABLE "posts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "author_id" character varying NOT NULL, "anonymous_id" character varying NOT NULL, "university_id" character varying NOT NULL, "faculty_id" uuid, "department_id" uuid, "visibility" "public"."posts_visibility_enum" NOT NULL DEFAULT 'university', "content" text NOT NULL, "image_urls" jsonb NOT NULL DEFAULT '[]', "poll" jsonb, "reactions" jsonb NOT NULL DEFAULT '[{"type":"like","count":0,"userIds":[]},{"type":"love","count":0,"userIds":[]},{"type":"laugh","count":0,"userIds":[]},{"type":"wow","count":0,"userIds":[]},{"type":"sad","count":0,"userIds":[]},{"type":"angry","count":0,"userIds":[]}]', "total_reactions" integer NOT NULL DEFAULT '0', "comment_count" integer NOT NULL DEFAULT '0', "view_count" integer NOT NULL DEFAULT '0', "is_edited" boolean NOT NULL DEFAULT false, "is_deleted" boolean NOT NULL DEFAULT false, "is_hidden" boolean NOT NULL DEFAULT false, "hidden_reason" text, "report_count" integer NOT NULL DEFAULT '0', "engagement_score" numeric(12,4) NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_2829ac61eff60fcec60d7274b9e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_312c63be865c81b922e39c2475" ON "posts" ("author_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_926042354dd0cc746d042ab730" ON "posts" ("university_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_2f4f5b3b63b38fec396b7078e4" ON "posts" ("is_deleted") `);
        await queryRunner.query(`CREATE INDEX "IDX_8b2fdcb4fb94d189e0e679748a" ON "posts" ("author_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_b9874034d37e2110f9c85646cb" ON "posts" ("university_id", "engagement_score") `);
        await queryRunner.query(`CREATE INDEX "IDX_e31abbf251ed95100dc5bc396a" ON "posts" ("university_id", "visibility", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_b932cf676feea1e77b00cdaa01" ON "posts" ("university_id", "created_at") `);
        await queryRunner.query(`CREATE TABLE "comments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "post_id" uuid NOT NULL, "parent_id" uuid, "author_id" character varying NOT NULL, "anonymous_id" character varying NOT NULL, "content" text NOT NULL, "reactions" jsonb NOT NULL DEFAULT '[{"type":"like","count":0,"userIds":[]},{"type":"love","count":0,"userIds":[]},{"type":"laugh","count":0,"userIds":[]}]', "total_reactions" integer NOT NULL DEFAULT '0', "reply_count" integer NOT NULL DEFAULT '0', "depth" integer NOT NULL DEFAULT '0', "is_edited" boolean NOT NULL DEFAULT false, "is_deleted" boolean NOT NULL DEFAULT false, "is_hidden" boolean NOT NULL DEFAULT false, "hidden_reason" text, "report_count" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_8bf68bc960f2b69e818bdb90dcb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_259bf9825d9d198608d1b46b0b" ON "comments" ("post_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d6f93329801a93536da4241e38" ON "comments" ("parent_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e6d38899c31997c45d128a8973" ON "comments" ("author_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_8d13ed91f67738c84692c0dc7b" ON "comments" ("is_deleted") `);
        await queryRunner.query(`CREATE INDEX "IDX_d66c646e7738b2abdb6d00ee1e" ON "comments" ("author_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_c58e01e7bdce174e1cd72d0e65" ON "comments" ("post_id", "parent_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_06a1038b5b8f236c9ddb068af5" ON "comments" ("post_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_259bf9825d9d198608d1b46b0b5" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_d6f93329801a93536da4241e386" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_d6f93329801a93536da4241e386"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_259bf9825d9d198608d1b46b0b5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_06a1038b5b8f236c9ddb068af5"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c58e01e7bdce174e1cd72d0e65"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d66c646e7738b2abdb6d00ee1e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8d13ed91f67738c84692c0dc7b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e6d38899c31997c45d128a8973"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d6f93329801a93536da4241e38"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_259bf9825d9d198608d1b46b0b"`);
        await queryRunner.query(`DROP TABLE "comments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b932cf676feea1e77b00cdaa01"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e31abbf251ed95100dc5bc396a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b9874034d37e2110f9c85646cb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8b2fdcb4fb94d189e0e679748a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2f4f5b3b63b38fec396b7078e4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_926042354dd0cc746d042ab730"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_312c63be865c81b922e39c2475"`);
        await queryRunner.query(`DROP TABLE "posts"`);
        await queryRunner.query(`DROP TYPE "public"."posts_visibility_enum"`);
    }

}
