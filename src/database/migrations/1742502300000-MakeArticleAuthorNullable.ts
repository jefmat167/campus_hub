import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeArticleAuthorNullable1742502300000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "articles" ALTER COLUMN "author_id" DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "articles" ALTER COLUMN "author_id" SET NOT NULL
    `);
  }
}
