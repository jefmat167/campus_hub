import { MigrationInterface, QueryRunner } from 'typeorm';

export class MakeEscrowListingOptionalAddBuyRequestOffer1742500000000
  implements MigrationInterface
{
  name = 'MakeEscrowListingOptionalAddBuyRequestOffer1742500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make listing_id nullable
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ALTER COLUMN "listing_id" DROP NOT NULL`,
    );

    // Add buy_request_offer_id column
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ADD "buy_request_offer_id" uuid`,
    );

    // Add index on buy_request_offer_id
    await queryRunner.query(
      `CREATE INDEX "IDX_escrow_buy_request_offer_id" ON "escrow_transactions" ("buy_request_offer_id")`,
    );

    // Add FK constraint
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ADD CONSTRAINT "FK_escrow_buy_request_offer" FOREIGN KEY ("buy_request_offer_id") REFERENCES "buy_request_offers"("id") ON DELETE SET NULL`,
    );

    // Add CHECK constraint: at least one source must be present
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ADD CONSTRAINT "CHK_escrow_has_source" CHECK ("listing_id" IS NOT NULL OR "buy_request_offer_id" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" DROP CONSTRAINT "CHK_escrow_has_source"`,
    );

    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" DROP CONSTRAINT "FK_escrow_buy_request_offer"`,
    );

    await queryRunner.query(
      `DROP INDEX "IDX_escrow_buy_request_offer_id"`,
    );

    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" DROP COLUMN "buy_request_offer_id"`,
    );

    // Restore listing_id as NOT NULL (only safe if all rows have listing_id)
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ALTER COLUMN "listing_id" SET NOT NULL`,
    );
  }
}
