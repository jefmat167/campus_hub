import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * System messages (offer rejected / withdrawn, buy request fulfilled or
 * cancelled) are posted into a conversation with no human sender —
 * `ChatService.sendSystemMessage` writes `sender_id = NULL` — but the column
 * was created NOT NULL, so every system message has failed since the feature
 * shipped (the failure surfaced as a 500 after the offer state had already
 * changed; now it is caught and logged, but the thread still stayed silent).
 * Relax the constraint; `isSystemMessage = true` marks these rows.
 */
export class NullableMessageSender1742504300000 implements MigrationInterface {
  name = 'NullableMessageSender1742504300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // System messages cannot survive the NOT NULL constraint coming back.
    await queryRunner.query(`DELETE FROM "messages" WHERE "sender_id" IS NULL`);
    await queryRunner.query(
      `ALTER TABLE "messages" ALTER COLUMN "sender_id" SET NOT NULL`,
    );
  }
}
