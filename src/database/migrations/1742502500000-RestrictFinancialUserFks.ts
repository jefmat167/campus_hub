import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Change the user-referencing FKs on financial tables from ON DELETE CASCADE
 * to ON DELETE RESTRICT, so a user with financial history (wallet, escrow,
 * dispute) can never be hard-deleted — which would otherwise wipe the ledger
 * and audit trail. The app soft-deletes users, so this only blocks a genuine
 * hard DELETE (which should be an anonymize instead).
 */
export class RestrictFinancialUserFks1742502500000
  implements MigrationInterface
{
  name = 'RestrictFinancialUserFks1742502500000';

  // constraint, table, column
  private readonly fks: ReadonlyArray<[string, string, string]> = [
    ['FK_wallets_user_id', 'wallets', 'user_id'],
    ['FK_escrow_transactions_buyer_id', 'escrow_transactions', 'buyer_id'],
    ['FK_escrow_transactions_seller_id', 'escrow_transactions', 'seller_id'],
    ['FK_disputes_opened_by_id', 'disputes', 'opened_by_id'],
  ];

  private async swap(
    queryRunner: QueryRunner,
    onDelete: 'RESTRICT' | 'CASCADE',
  ): Promise<void> {
    for (const [constraint, table, column] of this.fks) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${constraint}" ` +
          `FOREIGN KEY ("${column}") REFERENCES "users"("id") ON DELETE ${onDelete}`,
      );
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.swap(queryRunner, 'RESTRICT');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.swap(queryRunner, 'CASCADE');
  }
}
