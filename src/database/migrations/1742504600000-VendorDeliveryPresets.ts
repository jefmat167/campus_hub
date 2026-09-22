import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Vendor-level delivery presets (2026-09-21 amendment to marketplace rev-2
 * spec 03.2 — see the decision log under "Open items").
 *
 * Before: delivery was configured PER LISTING per served campus
 * (`listing_fulfillment`: deliveryEnabled + one fee), so a vendor re-typed the
 * same fee on every item and multi-item sub-orders needed a "highest single
 * line fee" rule. After: the `vendor_universities` row (one per served campus)
 * IS the preset —
 *   - "doorDeliveryFee"  : goods to the student's own address, HOME campus only
 *   - "serviceTravelFee" : the vendor travels to the student for services
 *   - vendor_delivery_points : the admin drop points the vendor delivers goods
 *                              to on that campus, each with its own fee
 * — and every listing inherits it, opting OUT only via listings."pickupOnly".
 *
 * DATA-MOVING. up() folds the old rows into the preset (fees are already kobo
 * in both tables — copied as-is, the entity transformer does not run in raw
 * SQL) and DROPS `listing_fulfillment`. Known, accepted loss (pre-launch, seed
 * data only): neighbour-campus goods delivery has no drop points to attach and
 * comes back as pickup-only at the neighbour until the vendor picks points in
 * the new settings screen. down() rebuilds `listing_fulfillment` with its
 * exact previous shape and reverse-fills one row per vendor listing × served
 * campus from the preset.
 */
export class VendorDeliveryPresets1742504600000 implements MigrationInterface {
  name = 'VendorDeliveryPresets1742504600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. preset fee columns on the served-campus row ─────────────
    await queryRunner.query(`
      ALTER TABLE "vendor_universities"
        ADD COLUMN "doorDeliveryFee" bigint,
        ADD COLUMN "serviceTravelFee" bigint,
        ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);

    // ── 2. chosen admin drop points, per served campus, with a fee ─
    await queryRunner.query(`
      CREATE TABLE "vendor_delivery_points" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendor_university_id" uuid NOT NULL,
        "drop_point_id" uuid NOT NULL,
        "fee" bigint NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_delivery_points" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vendor_delivery_points_pair" UNIQUE ("vendor_university_id", "drop_point_id"),
        CONSTRAINT "FK_vendor_delivery_points_vendor_university" FOREIGN KEY ("vendor_university_id")
          REFERENCES "vendor_universities"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vendor_delivery_points_drop_point" FOREIGN KEY ("drop_point_id")
          REFERENCES "drop_points"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_delivery_points_vendor_university" ON "vendor_delivery_points" ("vendor_university_id")`,
    );

    // ── 3. per-listing opt-out; P2P rows must stay false ───────────
    await queryRunner.query(
      `ALTER TABLE "listings" ADD COLUMN "pickupOnly" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT "CHK_listings_p2p_shape"`);
    await queryRunner.query(`
      ALTER TABLE "listings"
        ADD CONSTRAINT "CHK_listings_p2p_shape"
          CHECK ("kind" <> 'p2p' OR ("condition" IS NOT NULL AND "meetupPoints" IS NOT NULL AND "stock" IS NULL AND "manualConfirm" = false AND "pickupOnly" = false))
    `);

    // ── 4. fold listing_fulfillment into the preset ────────────────
    // Door delivery: the vendor's HOME campus only — the highest enabled goods
    // fee that vendor charged there. (Fees are kobo on both sides.)
    await queryRunner.query(`
      UPDATE "vendor_universities" vu
      SET "doorDeliveryFee" = src."fee"
      FROM (
        SELECT l."vendor_profile_id", lf."university_id",
               COALESCE(MAX(lf."deliveryFee"), 0) AS "fee"
        FROM "listing_fulfillment" lf
        JOIN "listings" l ON l."id" = lf."listing_id"
        JOIN "vendor_profiles" vp ON vp."id" = l."vendor_profile_id"
        WHERE lf."deliveryEnabled" = true
          AND l."kind" = 'vendor_goods'
          AND lf."university_id" = vp."home_university_id"
        GROUP BY l."vendor_profile_id", lf."university_id"
      ) src
      WHERE vu."vendor_profile_id" = src."vendor_profile_id"
        AND vu."university_id" = src."university_id"
    `);
    // Service travel: any served campus the vendor travelled to.
    await queryRunner.query(`
      UPDATE "vendor_universities" vu
      SET "serviceTravelFee" = src."fee"
      FROM (
        SELECT l."vendor_profile_id", lf."university_id",
               COALESCE(MAX(lf."deliveryFee"), 0) AS "fee"
        FROM "listing_fulfillment" lf
        JOIN "listings" l ON l."id" = lf."listing_id"
        WHERE lf."deliveryEnabled" = true
          AND l."kind" = 'vendor_service'
        GROUP BY l."vendor_profile_id", lf."university_id"
      ) src
      WHERE vu."vendor_profile_id" = src."vendor_profile_id"
        AND vu."university_id" = src."university_id"
    `);
    // pickupOnly: a vendor listing that never opted into delivery anywhere,
    // while a sibling of the same kind did — "this one item stays pickup".
    await queryRunner.query(`
      UPDATE "listings" l
      SET "pickupOnly" = true
      WHERE l."kind" <> 'p2p'
        AND NOT EXISTS (
          SELECT 1 FROM "listing_fulfillment" lf
          WHERE lf."listing_id" = l."id" AND lf."deliveryEnabled" = true
        )
        AND EXISTS (
          SELECT 1
          FROM "listing_fulfillment" lf2
          JOIN "listings" l2 ON l2."id" = lf2."listing_id"
          WHERE l2."vendor_profile_id" = l."vendor_profile_id"
            AND l2."kind" = l."kind"
            AND lf2."deliveryEnabled" = true
        )
    `);

    // ── 5. the per-listing table is gone ───────────────────────────
    // (drops FK_vlf_university + IDX_vlf_university with it)
    await queryRunner.query(`DROP TABLE "listing_fulfillment"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // ── rebuild listing_fulfillment exactly as 1742504400000 left it ─
    await queryRunner.query(`
      CREATE TABLE "listing_fulfillment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "university_id" uuid NOT NULL,
        "deliveryEnabled" boolean NOT NULL DEFAULT false,
        "deliveryFee" bigint,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listing_fulfillment" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_listing_fulfillment_pair" UNIQUE ("listing_id", "university_id"),
        CONSTRAINT "FK_listing_fulfillment_listing" FOREIGN KEY ("listing_id")
          REFERENCES "listings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vlf_university" FOREIGN KEY ("university_id")
          REFERENCES "universities"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_vlf_university" ON "listing_fulfillment" ("university_id")`,
    );

    // ── reverse-fill one row per vendor listing × served campus ────
    // Goods: door fee on the home campus, else the highest chosen drop-point
    // fee; services: the travel fee; pickupOnly → disabled. A neighbour campus
    // with no chosen points comes back disabled (nothing to derive a fee from).
    await queryRunner.query(`
      INSERT INTO "listing_fulfillment" ("listing_id", "university_id", "deliveryEnabled", "deliveryFee")
      SELECT
        l."id",
        vu."university_id",
        CASE
          WHEN l."pickupOnly" THEN false
          WHEN l."kind" = 'vendor_goods' THEN (
            (vu."university_id" = vp."home_university_id" AND vu."doorDeliveryFee" IS NOT NULL)
            OR EXISTS (SELECT 1 FROM "vendor_delivery_points" vdp WHERE vdp."vendor_university_id" = vu."id")
          )
          WHEN l."kind" = 'vendor_service' THEN vu."serviceTravelFee" IS NOT NULL
          ELSE false
        END,
        CASE
          WHEN l."pickupOnly" THEN NULL
          WHEN l."kind" = 'vendor_goods' THEN
            CASE
              WHEN vu."university_id" = vp."home_university_id" AND vu."doorDeliveryFee" IS NOT NULL
                THEN vu."doorDeliveryFee"
              ELSE (SELECT MAX(vdp."fee") FROM "vendor_delivery_points" vdp WHERE vdp."vendor_university_id" = vu."id")
            END
          WHEN l."kind" = 'vendor_service' THEN vu."serviceTravelFee"
          ELSE NULL
        END
      FROM "listings" l
      JOIN "vendor_profiles" vp ON vp."id" = l."vendor_profile_id"
      JOIN "vendor_universities" vu ON vu."vendor_profile_id" = vp."id"
      WHERE l."kind" <> 'p2p'
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_delivery_points"`);

    // Restore the old CHECK BEFORE dropping the column — dropping "pickupOnly"
    // first would auto-drop the constraint that references it.
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "CHK_listings_p2p_shape"`);
    await queryRunner.query(`
      ALTER TABLE "listings"
        ADD CONSTRAINT "CHK_listings_p2p_shape"
          CHECK ("kind" <> 'p2p' OR ("condition" IS NOT NULL AND "meetupPoints" IS NOT NULL AND "stock" IS NULL AND "manualConfirm" = false))
    `);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "pickupOnly"`);

    await queryRunner.query(`
      ALTER TABLE "vendor_universities"
        DROP COLUMN "doorDeliveryFee",
        DROP COLUMN "serviceTravelFee",
        DROP COLUMN "updatedAt"
    `);
  }
}
