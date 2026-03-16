import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletBalanceCheckConstraints1742083200000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "CHK_wallet_balance_non_negative" CHECK ("balance" >= 0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" ADD CONSTRAINT "CHK_wallet_locked_balance_non_negative" CHECK ("lockedBalance" >= 0)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "CHK_wallet_locked_balance_non_negative"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wallets" DROP CONSTRAINT "CHK_wallet_balance_non_negative"`,
    );
  }
}
