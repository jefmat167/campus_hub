import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataToPlatformWalletTransactions1742500800000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "platform_wallet_transactions" ADD COLUMN "metadata" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "platform_wallet_transactions" DROP COLUMN "metadata"`,
    );
  }
}
