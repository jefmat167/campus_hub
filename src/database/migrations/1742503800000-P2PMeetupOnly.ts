import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace rev-2, Phase 2 — P2P handover is meet-up only (spec 02).
 *
 * Every P2P handover happens at a named public location: the seller lists at
 * least 3 meet-up points, the buyer picks one at purchase. Seller-location
 * pickup is removed from P2P (a stranger coming to a hostel room is exactly
 * the handover P2P shouldn't encourage); shop pickup returns as a
 * vendors'-market concept in Phase 5.
 *
 * Backfills deficient dev rows (NULL or <3 points) by appending campus
 * defaults, then enforces NOT NULL and drops `deliveryMethods` +
 * `pickupAddress`.
 */
export class P2PMeetupOnly1742503800000 implements MigrationInterface {
  name = 'P2PMeetupOnly1742503800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pad rows that don't have 3 usable points yet (pre-launch dev data —
    // appended placeholders keep any real entries in front).
    await queryRunner.query(`
      UPDATE "listings"
      SET "meetupPoints" = COALESCE("meetupPoints", '[]'::jsonb)
        || '["Main Gate", "Library Building", "Student Union Building"]'::jsonb
      WHERE "meetupPoints" IS NULL
         OR jsonb_array_length("meetupPoints") < 3
    `);

    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "meetupPoints" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP COLUMN "deliveryMethods"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" DROP COLUMN "pickupAddress"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "listings" ADD COLUMN "pickupAddress" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ADD COLUMN "deliveryMethods" jsonb`,
    );
    // Every surviving listing offered meet-up by construction.
    await queryRunner.query(
      `UPDATE "listings" SET "deliveryMethods" = '["meetup"]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "deliveryMethods" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "listings" ALTER COLUMN "meetupPoints" DROP NOT NULL`,
    );
  }
}
