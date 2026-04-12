import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceIndexes1742500400000
  implements MigrationInterface
{
  name = 'AddPerformanceIndexes1742500400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // users: index on faculty_id and department_id (used in JOIN queries on login/profile)
    await queryRunner.query(
      `CREATE INDEX "IDX_users_faculty_id" ON "users" ("faculty_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_department_id" ON "users" ("department_id")`,
    );

    // verification_documents: composite (user_id, status) for deletion/update queries
    await queryRunner.query(
      `CREATE INDEX "IDX_verification_documents_user_status" ON "verification_documents" ("user_id", "status")`,
    );

    // offers: index on seller_id + composite for seller offer queries
    await queryRunner.query(
      `CREATE INDEX "IDX_offers_seller_id" ON "offers" ("seller_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_offers_seller_status_created" ON "offers" ("seller_id", "status", "created_at")`,
    );

    // wallet_transactions: composite (reference, status) for webhook processing
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_reference_status" ON "wallet_transactions" ("reference", "status")`,
    );

    // roommate_interests: composite (from_user_id, status) for sent interests queries
    await queryRunner.query(
      `CREATE INDEX "IDX_roommate_interests_from_user_status" ON "roommate_interests" ("from_user_id", "status")`,
    );

    // reports: composite (status, priority, created_at) for admin queue ordering
    await queryRunner.query(
      `CREATE INDEX "IDX_reports_status_priority_created" ON "reports" ("status", "priority", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_reports_status_priority_created"`);
    await queryRunner.query(`DROP INDEX "IDX_roommate_interests_from_user_status"`);
    await queryRunner.query(`DROP INDEX "IDX_wallet_transactions_reference_status"`);
    await queryRunner.query(`DROP INDEX "IDX_offers_seller_status_created"`);
    await queryRunner.query(`DROP INDEX "IDX_offers_seller_id"`);
    await queryRunner.query(`DROP INDEX "IDX_verification_documents_user_status"`);
    await queryRunner.query(`DROP INDEX "IDX_users_department_id"`);
    await queryRunner.query(`DROP INDEX "IDX_users_faculty_id"`);
  }
}
