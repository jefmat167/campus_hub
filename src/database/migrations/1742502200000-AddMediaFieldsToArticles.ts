import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaFieldsToArticles1742502200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "articles"
        ADD COLUMN "image_urls" jsonb,
        ADD COLUMN "video_url" varchar(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "articles"
        DROP COLUMN "video_url",
        DROP COLUMN "image_urls"
    `);
  }
}
