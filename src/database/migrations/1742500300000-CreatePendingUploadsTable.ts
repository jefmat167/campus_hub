import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePendingUploadsTable1742500300000
  implements MigrationInterface
{
  name = 'CreatePendingUploadsTable1742500300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "pending_uploads" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "object_key" character varying NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pending_uploads" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pending_uploads_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_pending_uploads_user_id" ON "pending_uploads" ("user_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_pending_uploads_created_at" ON "pending_uploads" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pending_uploads"`);
  }
}
