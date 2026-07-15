import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniversityIdsToArticles1742502100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "articles"
      ADD COLUMN "university_ids" jsonb DEFAULT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_articles_university_ids"
      ON "articles" USING gin ("university_ids")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_articles_university_ids"`);
    await queryRunner.query(`ALTER TABLE "articles" DROP COLUMN "university_ids"`);
  }
}
