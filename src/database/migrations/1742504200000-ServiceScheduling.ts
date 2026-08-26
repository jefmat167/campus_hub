import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marketplace rev-2, Phase 6 — service scheduling (spec 03.6).
 *
 * A booked service negotiates its appointment through time proposals
 * (buyer proposes at checkout; vendor accepts / rejects / counters — the
 * offer pattern reused, 48h expiry each). The order columns themselves
 * (appointmentAt, agreedAt, pending_confirmation) were pre-wired in Phase 3;
 * this migration adds only the negotiation trail + notification batch #2.
 */
export class ServiceScheduling1742504200000 implements MigrationInterface {
  name = 'ServiceScheduling1742504200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "service_time_proposals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "proposedBy" character varying(10) NOT NULL,
        "proposedTime" TIMESTAMPTZ NOT NULL,
        "message" text,
        "status" character varying(12) NOT NULL DEFAULT 'pending',
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_service_time_proposals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_service_time_proposals_order" FOREIGN KEY ("order_id")
          REFERENCES "escrow_transactions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_service_time_proposals_order" ON "service_time_proposals" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_service_time_proposals_order_status" ON "service_time_proposals" ("order_id", "status")`,
    );

    // Notification enum batch #2 (batch #1 landed with CheckoutOrdersCart).
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'appointment_proposed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'appointment_agreed'`,
    );
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'no_show_refund'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_time_proposals"`);
    // Enum value removals are intentionally a no-op (PG can't drop enum
    // values in place) — same precedent as every prior enum addition.
  }
}
