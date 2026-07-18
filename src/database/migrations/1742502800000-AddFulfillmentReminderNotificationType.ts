import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add a 'fulfillment_reminder' value to the notification type enum, used to
 * nudge a seller about an order still awaiting their confirmation.
 *
 * Requires PostgreSQL 12+ (ALTER TYPE ... ADD VALUE inside a transaction).
 * Removing an enum value is not supported by Postgres, so down() is a no-op.
 */
export class AddFulfillmentReminderNotificationType1742502800000
  implements MigrationInterface
{
  name = 'AddFulfillmentReminderNotificationType1742502800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "notification_type_enum" ADD VALUE IF NOT EXISTS 'fulfillment_reminder'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres cannot drop an enum value without recreating the type; no-op.
  }
}
