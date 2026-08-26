import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace rev-2, Phase 5 — vendor orders (spec 03.2 / 03.4 / 03.5).
 *
 * The order machinery itself was pre-wired in Phase 3 (confirmation +
 * delivery columns on escrow_transactions, pending_confirmation status,
 * order_confirmed/order_rejected notification types). The one schema gap:
 * vendor profiles never carried a shop address, and pickup orders snapshot
 * the collection location onto the order — so `shop_address` lands here.
 *
 * (Numbering note: the plan reserved 1742504100000 for service scheduling;
 * services move to 1742504200000 in Phase 6.)
 */
export class VendorOrders1742504100000 implements MigrationInterface {
  name = 'VendorOrders1742504100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_profiles" ADD COLUMN "shop_address" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "vendor_profiles" DROP COLUMN IF EXISTS "shop_address"`,
    );
  }
}
