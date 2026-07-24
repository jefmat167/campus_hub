import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery methods v1 (pick-up + meet-up; door delivery parked). Replaces the
 * decorative single `deliveryOption` / `meetupLocation` on listings with a
 * multi-method model, and records the buyer's chosen method on the escrow.
 *
 * Listings gain `deliveryMethods` (jsonb array, >=1), `pickupAddress`, and
 * `meetupPoints` (jsonb array). Existing rows are backfilled from the old
 * columns, which are then dropped (pre-launch, so lossy backfill is fine).
 * Escrow gains a `deliveryMethod` snapshot column.
 */
export class AddDeliveryMethods1742503400000 implements MigrationInterface {
  name = 'AddDeliveryMethods1742503400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "listings" ADD COLUMN "deliveryMethods" jsonb`);
    await queryRunner.query(`ALTER TABLE "listings" ADD COLUMN "pickupAddress" text`);
    await queryRunner.query(`ALTER TABLE "listings" ADD COLUMN "meetupPoints" jsonb`);

    // Backfill from the old single option/location (door delivery → meet-up).
    await queryRunner.query(`
      UPDATE "listings" SET
        "deliveryMethods" = CASE "deliveryOption"
          WHEN 'pickup_only' THEN '["pickup"]'::jsonb
          ELSE '["meetup"]'::jsonb
        END,
        "pickupAddress" = CASE
          WHEN "deliveryOption" = 'pickup_only' THEN "meetupLocation"
          ELSE NULL
        END,
        "meetupPoints" = CASE
          WHEN "deliveryOption" <> 'pickup_only' AND "meetupLocation" IS NOT NULL
            THEN jsonb_build_array("meetupLocation")
          ELSE NULL
        END
    `);
    await queryRunner.query(
      `UPDATE "listings" SET "deliveryMethods" = '["meetup"]'::jsonb WHERE "deliveryMethods" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "deliveryMethods" SET NOT NULL`,
    );

    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "deliveryOption"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "meetupLocation"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "delivery_option_enum"`);

    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ADD COLUMN "deliveryMethod" character varying(20)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "escrow_transactions" DROP COLUMN "deliveryMethod"`);
    await queryRunner.query(
      `CREATE TYPE "delivery_option_enum" AS ENUM('pickup_only', 'delivery_available', 'meetup')`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD COLUMN "deliveryOption" "delivery_option_enum" NOT NULL DEFAULT 'meetup'`,
    );
    await queryRunner.query(`ALTER TABLE "listings" ADD COLUMN "meetupLocation" text`);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "meetupPoints"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "pickupAddress"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "deliveryMethods"`);
  }
}
