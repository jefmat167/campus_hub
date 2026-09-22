import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Unified marketplace (2026-09): ONE `listings` table for student resale AND
 * vendor goods / services, discriminated by `kind`, so students browse a
 * single feed and every cross-kind feature (favorites, reviews, reports,
 * search) is one foreign key instead of a polymorphic pair.
 *
 * - `listings` gains `kind`, `vendor_profile_id`, `stock`, `manualConfirm`;
 *   `condition` / `meetupPoints` become nullable (P2P-only, CHECK-enforced);
 *   the legacy `type` (sell | buy_request) goes — buy requests have their own
 *   table; timestamps become TIMESTAMPTZ (the vendor table already was).
 * - `vendor_listings` rows move in (seller = the vendor's user, campus = the
 *   vendor's home university), `vendor_listing_images` fold into
 *   `listing_images`, `option_groups` and the fulfillment table re-point at
 *   `listings.id` (`vendor_listing_fulfillment` → `listing_fulfillment`).
 * - `cart_items` / `order_items` lose `vendor_listing_id`; `listing_id` now
 *   carries every kind (order_items keep `itemType` as the kind snapshot).
 * - Four CHECK constraints keep each kind's shape honest.
 */
export class UnifiedListings1742504400000 implements MigrationInterface {
  name = 'UnifiedListings1742504400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── listings: new shape ────────────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "listings"
        ADD COLUMN "kind" character varying(16) NOT NULL DEFAULT 'p2p',
        ADD COLUMN "vendor_profile_id" uuid,
        ADD COLUMN "stock" integer,
        ADD COLUMN "manualConfirm" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "kind" DROP DEFAULT`);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "condition" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "meetupPoints" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "isNegotiable" SET DEFAULT false`);
    await queryRunner.query(`
      ALTER TABLE "listings"
        ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ,
        ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ
    `);
    await queryRunner.query(`ALTER TABLE "listings" DROP COLUMN "type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "listing_type_enum"`);
    await queryRunner.query(`
      ALTER TABLE "listings"
        ADD CONSTRAINT "FK_listings_vendor_profile" FOREIGN KEY ("vendor_profile_id")
          REFERENCES "vendor_profiles"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_listings_kind" ON "listings" ("kind")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_kind_status_createdAt" ON "listings" ("kind", "status", "createdAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_listings_vendor_profile_status" ON "listings" ("vendor_profile_id", "status")`,
    );

    // ── move vendor rows in ────────────────────────────────────────
    await queryRunner.query(`
      INSERT INTO "listings" (
        "id", "kind", "seller_id", "vendor_profile_id", "university_id",
        "title", "description", "category", "price", "isNegotiable",
        "visibilityScope", "meetupPoints", "stock", "manualConfirm", "status",
        "viewCount", "favoriteCount", "createdAt", "updatedAt"
      )
      SELECT
        vl."id",
        CASE WHEN vl."type" = 'service' THEN 'vendor_service' ELSE 'vendor_goods' END,
        vp."user_id",
        vl."vendor_profile_id",
        vp."home_university_id",
        vl."title",
        vl."description",
        vl."category"::"listing_category_enum",
        vl."basePrice",
        false,
        'university',
        NULL,
        vl."stock",
        vl."manualConfirm",
        vl."status"::"listing_status_enum",
        vl."viewCount",
        0,
        vl."createdAt",
        vl."updatedAt"
      FROM "vendor_listings" vl
      JOIN "vendor_profiles" vp ON vp."id" = vl."vendor_profile_id"
    `);
    await queryRunner.query(`
      INSERT INTO "listing_images" ("id", "listing_id", "url", "position", "createdAt")
      SELECT "id", "vendor_listing_id", "url", "position", "createdAt"
      FROM "vendor_listing_images"
    `);
    await queryRunner.query(`DROP TABLE "vendor_listing_images"`);

    // ── option groups → listings ───────────────────────────────────
    await queryRunner.query(`ALTER TABLE "option_groups" DROP CONSTRAINT "FK_option_groups_listing"`);
    await queryRunner.query(`ALTER TABLE "option_groups" RENAME COLUMN "vendor_listing_id" TO "listing_id"`);
    await queryRunner.query(`
      ALTER TABLE "option_groups"
        ADD CONSTRAINT "FK_option_groups_listing" FOREIGN KEY ("listing_id")
          REFERENCES "listings"("id") ON DELETE CASCADE
    `);

    // ── fulfillment → listing_fulfillment ──────────────────────────
    await queryRunner.query(`ALTER TABLE "vendor_listing_fulfillment" DROP CONSTRAINT "FK_vlf_listing"`);
    await queryRunner.query(`ALTER TABLE "vendor_listing_fulfillment" RENAME COLUMN "vendor_listing_id" TO "listing_id"`);
    await queryRunner.query(`ALTER TABLE "vendor_listing_fulfillment" RENAME TO "listing_fulfillment"`);
    await queryRunner.query(
      `ALTER TABLE "listing_fulfillment" RENAME CONSTRAINT "UQ_vendor_listing_fulfillment_pair" TO "UQ_listing_fulfillment_pair"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_fulfillment" RENAME CONSTRAINT "PK_vendor_listing_fulfillment" TO "PK_listing_fulfillment"`,
    );
    await queryRunner.query(`
      ALTER TABLE "listing_fulfillment"
        ADD CONSTRAINT "FK_listing_fulfillment_listing" FOREIGN KEY ("listing_id")
          REFERENCES "listings"("id") ON DELETE CASCADE
    `);

    // ── cart_items: one listing column ─────────────────────────────
    await queryRunner.query(`
      UPDATE "cart_items" SET "listing_id" = "vendor_listing_id"
      WHERE "listing_id" IS NULL AND "vendor_listing_id" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "FK_cart_items_vendor_listing"`);
    await queryRunner.query(`ALTER TABLE "cart_items" DROP COLUMN "vendor_listing_id"`);
    await queryRunner.query(`DELETE FROM "cart_items" WHERE "listing_id" IS NULL`);
    await queryRunner.query(`ALTER TABLE "cart_items" ALTER COLUMN "listing_id" SET NOT NULL`);
    // Vendor goods may legitimately have several lines for one listing
    // (different option sets); the one-line-per-P2P-listing rule is enforced
    // in CartService, not by the old partial unique index.
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_cart_items_cart_listing"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_cart_items_cart_listing" ON "cart_items" ("cart_id", "listing_id")`,
    );

    // ── order_items: one listing column, itemType is the kind snapshot ─
    await queryRunner.query(`
      UPDATE "order_items" SET "listing_id" = "vendor_listing_id"
      WHERE "listing_id" IS NULL AND "vendor_listing_id" IS NOT NULL
    `);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_vendor_listing"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "CHK_order_item_has_subject"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "vendor_listing_id"`);

    // ── the old table is empty now ─────────────────────────────────
    await queryRunner.query(`DROP TABLE "vendor_listings"`);

    // ── per-kind shape guarantees ──────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE "listings"
        ADD CONSTRAINT "CHK_listings_vendor_profile"
          CHECK (("kind" = 'p2p') = ("vendor_profile_id" IS NULL)),
        ADD CONSTRAINT "CHK_listings_p2p_shape"
          CHECK ("kind" <> 'p2p' OR ("condition" IS NOT NULL AND "meetupPoints" IS NOT NULL AND "stock" IS NULL AND "manualConfirm" = false)),
        ADD CONSTRAINT "CHK_listings_vendor_shape"
          CHECK ("kind" = 'p2p' OR ("isNegotiable" = false AND "meetupPoints" IS NULL AND "visibilityScope" = 'university' AND "status" NOT IN ('sold', 'in_escrow'))),
        ADD CONSTRAINT "CHK_listings_service_shape"
          CHECK ("kind" <> 'vendor_service' OR ("stock" IS NULL AND "manualConfirm" = true))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "listings"
        DROP CONSTRAINT IF EXISTS "CHK_listings_service_shape",
        DROP CONSTRAINT IF EXISTS "CHK_listings_vendor_shape",
        DROP CONSTRAINT IF EXISTS "CHK_listings_p2p_shape",
        DROP CONSTRAINT IF EXISTS "CHK_listings_vendor_profile"
    `);

    // Recreate the vendor tables (shape from 1742504000000-VendorCatalog).
    await queryRunner.query(`
      CREATE TABLE "vendor_listings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendor_profile_id" uuid NOT NULL,
        "type" character varying(10) NOT NULL,
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "category" character varying(30) NOT NULL,
        "basePrice" bigint NOT NULL,
        "stock" integer,
        "manualConfirm" boolean NOT NULL DEFAULT false,
        "status" character varying(10) NOT NULL DEFAULT 'active',
        "viewCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_listings" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_listings_profile" FOREIGN KEY ("vendor_profile_id")
          REFERENCES "vendor_profiles"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_listings_profile_status" ON "vendor_listings" ("vendor_profile_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_listings_category_status" ON "vendor_listings" ("category", "status")`,
    );
    await queryRunner.query(`
      INSERT INTO "vendor_listings" (
        "id", "vendor_profile_id", "type", "title", "description", "category",
        "basePrice", "stock", "manualConfirm", "status", "viewCount", "createdAt", "updatedAt"
      )
      SELECT
        "id", "vendor_profile_id",
        CASE WHEN "kind" = 'vendor_service' THEN 'service' ELSE 'goods' END,
        "title", "description", "category"::text, "price", "stock", "manualConfirm",
        "status"::text, "viewCount", "createdAt", "updatedAt"
      FROM "listings" WHERE "kind" <> 'p2p'
    `);

    await queryRunner.query(`
      CREATE TABLE "vendor_listing_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendor_listing_id" uuid NOT NULL,
        "url" character varying(500) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_listing_images" PRIMARY KEY ("id"),
        CONSTRAINT "FK_vendor_listing_images_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_vendor_listing_images_listing" ON "vendor_listing_images" ("vendor_listing_id", "position")`,
    );
    await queryRunner.query(`
      INSERT INTO "vendor_listing_images" ("id", "vendor_listing_id", "url", "position", "createdAt")
      SELECT li."id", li."listing_id", li."url", li."position", li."createdAt"
      FROM "listing_images" li JOIN "listings" l ON l."id" = li."listing_id"
      WHERE l."kind" <> 'p2p'
    `);
    await queryRunner.query(`
      DELETE FROM "listing_images" li USING "listings" l
      WHERE l."id" = li."listing_id" AND l."kind" <> 'p2p'
    `);

    // order_items / cart_items: split the column again
    await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN "vendor_listing_id" uuid`);
    await queryRunner.query(`
      UPDATE "order_items" oi SET "vendor_listing_id" = oi."listing_id", "listing_id" = NULL
      FROM "listings" l WHERE l."id" = oi."listing_id" AND l."kind" <> 'p2p'
    `);
    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "FK_order_items_vendor_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "CHK_order_item_has_subject"
          CHECK ("listing_id" IS NOT NULL OR "vendor_listing_id" IS NOT NULL)
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_items_cart_listing"`);
    await queryRunner.query(`ALTER TABLE "cart_items" ALTER COLUMN "listing_id" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "cart_items" ADD COLUMN "vendor_listing_id" uuid`);
    await queryRunner.query(`
      UPDATE "cart_items" ci SET "vendor_listing_id" = ci."listing_id", "listing_id" = NULL
      FROM "listings" l WHERE l."id" = ci."listing_id" AND l."kind" <> 'p2p'
    `);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "FK_cart_items_vendor_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cart_items_cart_listing"
      ON "cart_items" ("cart_id", "listing_id") WHERE "listing_id" IS NOT NULL
    `);

    // fulfillment + option groups back to vendor_listings
    await queryRunner.query(`ALTER TABLE "listing_fulfillment" DROP CONSTRAINT "FK_listing_fulfillment_listing"`);
    await queryRunner.query(
      `ALTER TABLE "listing_fulfillment" RENAME CONSTRAINT "PK_listing_fulfillment" TO "PK_vendor_listing_fulfillment"`,
    );
    await queryRunner.query(
      `ALTER TABLE "listing_fulfillment" RENAME CONSTRAINT "UQ_listing_fulfillment_pair" TO "UQ_vendor_listing_fulfillment_pair"`,
    );
    await queryRunner.query(`ALTER TABLE "listing_fulfillment" RENAME TO "vendor_listing_fulfillment"`);
    await queryRunner.query(`ALTER TABLE "vendor_listing_fulfillment" RENAME COLUMN "listing_id" TO "vendor_listing_id"`);
    await queryRunner.query(`
      ALTER TABLE "vendor_listing_fulfillment"
        ADD CONSTRAINT "FK_vlf_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`ALTER TABLE "option_groups" DROP CONSTRAINT "FK_option_groups_listing"`);
    await queryRunner.query(`ALTER TABLE "option_groups" RENAME COLUMN "listing_id" TO "vendor_listing_id"`);
    await queryRunner.query(`
      ALTER TABLE "option_groups"
        ADD CONSTRAINT "FK_option_groups_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE CASCADE
    `);

    // listings back to P2P-only shape
    await queryRunner.query(`DELETE FROM "listings" WHERE "kind" <> 'p2p'`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_vendor_profile_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_kind_status_createdAt"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_listings_kind"`);
    await queryRunner.query(`ALTER TABLE "listings" DROP CONSTRAINT IF EXISTS "FK_listings_vendor_profile"`);
    await queryRunner.query(`CREATE TYPE "listing_type_enum" AS ENUM ('sell', 'buy_request')`);
    await queryRunner.query(
      `ALTER TABLE "listings" ADD COLUMN "type" "listing_type_enum" NOT NULL DEFAULT 'sell'`,
    );
    await queryRunner.query(`
      ALTER TABLE "listings"
        ALTER COLUMN "createdAt" TYPE TIMESTAMP,
        ALTER COLUMN "updatedAt" TYPE TIMESTAMP
    `);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "isNegotiable" SET DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "meetupPoints" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "listings" ALTER COLUMN "condition" SET NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE "listings"
        DROP COLUMN "manualConfirm",
        DROP COLUMN "stock",
        DROP COLUMN "vendor_profile_id",
        DROP COLUMN "kind"
    `);
  }
}
