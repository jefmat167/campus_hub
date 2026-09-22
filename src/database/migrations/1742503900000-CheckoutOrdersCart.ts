import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace rev-2, Phase 3 — cart & checkout core (spec 01.6 / 02.1 / 03.4).
 *
 * A checkout is one wallet debit split into one independent sub-order per
 * seller, and A SUB-ORDER IS AN ESCROW TRANSACTION:
 * - `checkouts`  — thin grouping row (exists only on success; no state machine)
 * - `order_items`— the lines inside a sub-order (a sub-order can bundle
 *   several items from the same seller); carries the price/title snapshots
 * - `carts` / `cart_items` — no holds: carting reserves nothing, checkout is
 *   what flips listings to IN_ESCROW (conditionally, race-checked)
 *
 * escrow_transactions gains grouping/market/money-breakdown/confirmation/
 * appointment columns (confirmation + appointment are used from Phases 5–6;
 * `payment_plan` is the deposit-model seam, spec 05). The dead `listing_id`
 * and `offer_id` columns are dropped — item links live on order_items now —
 * and the source CHECK becomes (buy_request_offer_id OR checkout_id),
 * added NOT VALID so pre-rewrite dev rows (listing-linked, no checkout)
 * don't block the migration.
 *
 * Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction).
 */
export class CheckoutOrdersCart1742503900000 implements MigrationInterface {
  name = 'CheckoutOrdersCart1742503900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── checkouts ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "checkouts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "buyer_id" uuid NOT NULL,
        "university_id" uuid,
        "itemsSubtotal" bigint NOT NULL,
        "deliveryFeeTotal" bigint NOT NULL DEFAULT 0,
        "total" bigint NOT NULL,
        "walletReference" character varying(100) NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_checkouts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_checkouts_wallet_reference" UNIQUE ("walletReference"),
        CONSTRAINT "FK_checkouts_buyer" FOREIGN KEY ("buyer_id")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_checkouts_buyer" ON "checkouts" ("buyer_id")`,
    );

    // ── carts ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carts_user" UNIQUE ("user_id"),
        CONSTRAINT "FK_carts_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "cart_id" uuid NOT NULL,
        "listing_id" uuid,
        "vendor_listing_id" uuid,
        "offer_id" uuid,
        "quantity" integer NOT NULL DEFAULT 1,
        "selectedOptions" jsonb,
        "priceAtAdd" bigint NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cart_items_cart" FOREIGN KEY ("cart_id")
          REFERENCES "carts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cart_items_listing" FOREIGN KEY ("listing_id")
          REFERENCES "listings"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_cart_items_offer" FOREIGN KEY ("offer_id")
          REFERENCES "offers"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_cart_items_cart" ON "cart_items" ("cart_id")`,
    );
    // One line per P2P listing per cart (vendor lines dedupe by options — Phase 5).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_cart_items_cart_listing"
      ON "cart_items" ("cart_id", "listing_id") WHERE "listing_id" IS NOT NULL
    `);

    // ── escrow_transactions: sub-order columns ─────────────────────
    await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
        ADD COLUMN "checkout_id" uuid,
        ADD COLUMN "market" character varying(10),
        ADD COLUMN "itemsSubtotal" bigint,
        ADD COLUMN "deliveryFee" bigint NOT NULL DEFAULT 0,
        ADD COLUMN "confirmationRequired" boolean NOT NULL DEFAULT false,
        ADD COLUMN "confirmedAt" TIMESTAMPTZ,
        ADD COLUMN "appointmentAt" TIMESTAMPTZ,
        ADD COLUMN "agreedAt" TIMESTAMPTZ,
        ADD COLUMN "drop_point_id" uuid,
        ADD COLUMN "deliveryAddress" text,
        ADD COLUMN "cancelledBy" character varying(10),
        ADD COLUMN "cancelReason" character varying(30),
        ADD COLUMN "paymentPlan" character varying(20) NOT NULL DEFAULT 'full_upfront'
    `);
    await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
        ADD CONSTRAINT "FK_escrow_checkout" FOREIGN KEY ("checkout_id")
          REFERENCES "checkouts"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_escrow_drop_point" FOREIGN KEY ("drop_point_id")
          REFERENCES "drop_points"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_escrow_checkout" ON "escrow_transactions" ("checkout_id")`,
    );

    // Item links live on order_items now; both columns were unread/broken
    // (offer_id was write-only; listing_id is replaced by the items table).
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" DROP CONSTRAINT IF EXISTS "CHK_escrow_has_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" DROP COLUMN "listing_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" DROP COLUMN "offer_id"`,
    );
    // NOT VALID: pre-rewrite dev rows have neither source; new rows are checked.
    await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
        ADD CONSTRAINT "CHK_escrow_has_source"
        CHECK ("buy_request_offer_id" IS NOT NULL OR "checkout_id" IS NOT NULL)
        NOT VALID
    `);

    // ── order_items ────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "itemType" character varying(20) NOT NULL,
        "listing_id" uuid,
        "vendor_listing_id" uuid,
        "offer_id" uuid,
        "titleSnapshot" character varying(255) NOT NULL,
        "unitPrice" bigint NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "optionsSnapshot" jsonb,
        "lineTotal" bigint NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_items_order" FOREIGN KEY ("order_id")
          REFERENCES "escrow_transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_order_items_listing" FOREIGN KEY ("listing_id")
          REFERENCES "listings"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_order_items_offer" FOREIGN KEY ("offer_id")
          REFERENCES "offers"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_order_item_has_subject"
          CHECK ("listing_id" IS NOT NULL OR "vendor_listing_id" IS NOT NULL)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_order" ON "order_items" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_items_listing" ON "order_items" ("listing_id")`,
    );

    // ── wallet_transactions: business-income tagging (spec 01.1) ───
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" ADD COLUMN "market" character varying(10)`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_market" ON "wallet_transactions" ("market")`,
    );

    // ── enum additions ─────────────────────────────────────────────
    await queryRunner.query(
      `ALTER TYPE "escrow_status_enum" ADD VALUE IF NOT EXISTS 'pending_confirmation'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_confirmed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'order_rejected'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "order_items"`);
    await queryRunner.query(
      `ALTER TABLE "wallet_transactions" DROP COLUMN IF EXISTS "market"`,
    );
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" DROP CONSTRAINT IF EXISTS "CHK_escrow_has_source"`,
    );
    // Data in the dropped columns is not reconstructable (item links lived on
    // order_items); the columns come back empty.
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ADD COLUMN "listing_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "escrow_transactions" ADD COLUMN "offer_id" uuid`,
    );
    await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
        DROP CONSTRAINT IF EXISTS "FK_escrow_checkout",
        DROP CONSTRAINT IF EXISTS "FK_escrow_drop_point",
        DROP COLUMN IF EXISTS "checkout_id",
        DROP COLUMN IF EXISTS "market",
        DROP COLUMN IF EXISTS "itemsSubtotal",
        DROP COLUMN IF EXISTS "deliveryFee",
        DROP COLUMN IF EXISTS "confirmationRequired",
        DROP COLUMN IF EXISTS "confirmedAt",
        DROP COLUMN IF EXISTS "appointmentAt",
        DROP COLUMN IF EXISTS "agreedAt",
        DROP COLUMN IF EXISTS "drop_point_id",
        DROP COLUMN IF EXISTS "deliveryAddress",
        DROP COLUMN IF EXISTS "cancelledBy",
        DROP COLUMN IF EXISTS "cancelReason",
        DROP COLUMN IF EXISTS "paymentPlan"
    `);
    await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
        ADD CONSTRAINT "CHK_escrow_has_source"
        CHECK ("listing_id" IS NOT NULL OR "buy_request_offer_id" IS NOT NULL)
        NOT VALID
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "cart_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "carts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "checkouts"`);
    // Enum values added in up() are left behind (Postgres can't drop them).
  }
}
