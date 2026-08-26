import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace rev-2, Phase 4 — vendor catalog (spec 03.3).
 *
 * One listing model with a shared CORE (title/photos/price/category), not one
 * all-nullable table: the vendors' market gets its own entities.
 * - `vendor_listings`   — goods & services; `stock` NULL = untracked
 *   (untracked stock forces manual confirmation; services always manual and
 *   never carry stock — rev-2 03.5 + decision log #8)
 * - `option_groups` / `options` — variants AND add-ons through one mechanism
 *   (FIG 03.2): a group has a selection rule + required flag; each option can
 *   carry its own price delta and its own stock
 * - `vendor_listing_fulfillment` — per-listing, per-university delivery
 *   opt-in + fee (spec 03.2); pickup at the shop is implicitly available at
 *   every served university
 * - back-fills the FKs that Phase 3 left dangling: order_items and
 *   cart_items `vendor_listing_id`
 */
export class VendorCatalog1742504000000 implements MigrationInterface {
  name = 'VendorCatalog1742504000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
      CREATE TABLE "option_groups" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendor_listing_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "selectionType" character varying(10) NOT NULL,
        "required" boolean NOT NULL DEFAULT false,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_option_groups" PRIMARY KEY ("id"),
        CONSTRAINT "FK_option_groups_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_option_groups_listing" ON "option_groups" ("vendor_listing_id", "position")`,
    );

    await queryRunner.query(`
      CREATE TABLE "options" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "option_group_id" uuid NOT NULL,
        "name" character varying(100) NOT NULL,
        "priceDelta" bigint NOT NULL DEFAULT 0,
        "stock" integer,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_options" PRIMARY KEY ("id"),
        CONSTRAINT "FK_options_group" FOREIGN KEY ("option_group_id")
          REFERENCES "option_groups"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_options_group" ON "options" ("option_group_id", "position")`,
    );

    await queryRunner.query(`
      CREATE TABLE "vendor_listing_fulfillment" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "vendor_listing_id" uuid NOT NULL,
        "university_id" uuid NOT NULL,
        "deliveryEnabled" boolean NOT NULL DEFAULT false,
        "deliveryFee" bigint,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_vendor_listing_fulfillment" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_vendor_listing_fulfillment_pair" UNIQUE ("vendor_listing_id", "university_id"),
        CONSTRAINT "FK_vlf_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_vlf_university" FOREIGN KEY ("university_id")
          REFERENCES "universities"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_vlf_university" ON "vendor_listing_fulfillment" ("university_id")`,
    );

    // FKs deferred from Phase 3 (the columns already exist).
    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "FK_order_items_vendor_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "FK_cart_items_vendor_listing" FOREIGN KEY ("vendor_listing_id")
          REFERENCES "vendor_listings"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "FK_cart_items_vendor_listing"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_vendor_listing"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_listing_fulfillment"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "options"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "option_groups"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_listing_images"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "vendor_listings"`);
  }
}
