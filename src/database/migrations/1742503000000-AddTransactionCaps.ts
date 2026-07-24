import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cumulative / velocity transaction caps: per-tier ceilings on escrow spend and
 * withdrawals over a rolling window, editable by admins at runtime.
 *
 * Creates `transaction_caps` (one row per tier/capType/period; NULL amount =
 * unlimited) seeded with default DAILY figures, and adds a
 * `transaction_cap_update` value to the audit action enum.
 *
 * v1 enforces the `daily` period only; `weekly` rows are seeded as unlimited
 * (NULL) so the schema is ready without changing behaviour.
 *
 * Amounts are stored as integer kobo (₦1 = 100 kobo). Requires PostgreSQL 12+
 * (ALTER TYPE ... ADD VALUE inside a transaction).
 */
export class AddTransactionCaps1742503000000 implements MigrationInterface {
  name = 'AddTransactionCaps1742503000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transaction_caps" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tier" character varying(20) NOT NULL,
        "cap_type" character varying(20) NOT NULL,
        "period" character varying(20) NOT NULL,
        "amount" bigint,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_caps" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_transaction_caps_tier_type_period"
      ON "transaction_caps" ("tier", "cap_type", "period")
    `);

    // Default DAILY caps (integer kobo; NULL = unlimited).
    //   spend:      TIER_0 ₦100k, TIER_1 ₦300k, TIER_2 unlimited
    //   withdrawal: TIER_0 ₦50k,  TIER_1 ₦200k, TIER_2 ₦1,000,000
    // WEEKLY rows are seeded NULL (unlimited) — schema-ready, not yet enforced.
    await queryRunner.query(`
      INSERT INTO "transaction_caps" ("tier", "cap_type", "period", "amount") VALUES
        ('tier_0', 'spend',      'daily',  10000000),
        ('tier_1', 'spend',      'daily',  30000000),
        ('tier_2', 'spend',      'daily',  NULL),
        ('tier_0', 'withdrawal', 'daily',  5000000),
        ('tier_1', 'withdrawal', 'daily',  20000000),
        ('tier_2', 'withdrawal', 'daily',  100000000),
        ('tier_0', 'spend',      'weekly', NULL),
        ('tier_1', 'spend',      'weekly', NULL),
        ('tier_2', 'spend',      'weekly', NULL),
        ('tier_0', 'withdrawal', 'weekly', NULL),
        ('tier_1', 'withdrawal', 'weekly', NULL),
        ('tier_2', 'withdrawal', 'weekly', NULL)
    `);

    await queryRunner.query(
      `ALTER TYPE "audit_action_enum" ADD VALUE IF NOT EXISTS 'transaction_cap_update'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "transaction_caps"`);
    // Postgres cannot drop an enum value without recreating the type; the
    // 'transaction_cap_update' value is left in audit_action_enum (harmless).
  }
}
