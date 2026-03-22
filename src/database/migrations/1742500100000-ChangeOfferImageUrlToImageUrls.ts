import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeOfferImageUrlToImageUrls1742500100000
  implements MigrationInterface
{
  name = 'ChangeOfferImageUrlToImageUrls1742500100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Convert existing single image_url varchar to image_urls jsonb array
    await queryRunner.query(
      `ALTER TABLE "buy_request_offers" ADD "image_urls" jsonb`,
    );

    // Migrate existing data: wrap single URL in an array
    await queryRunner.query(
      `UPDATE "buy_request_offers" SET "image_urls" = jsonb_build_array("image_url") WHERE "image_url" IS NOT NULL`,
    );

    // Drop old column
    await queryRunner.query(
      `ALTER TABLE "buy_request_offers" DROP COLUMN "image_url"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add old column
    await queryRunner.query(
      `ALTER TABLE "buy_request_offers" ADD "image_url" varchar(500)`,
    );

    // Migrate back: take first URL from array
    await queryRunner.query(
      `UPDATE "buy_request_offers" SET "image_url" = "image_urls"->>0 WHERE "image_urls" IS NOT NULL AND jsonb_array_length("image_urls") > 0`,
    );

    // Drop new column
    await queryRunner.query(
      `ALTER TABLE "buy_request_offers" DROP COLUMN "image_urls"`,
    );
  }
}
