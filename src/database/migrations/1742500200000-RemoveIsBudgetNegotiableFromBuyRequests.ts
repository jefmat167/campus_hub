import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveIsBudgetNegotiableFromBuyRequests1742500200000
  implements MigrationInterface
{
  name = 'RemoveIsBudgetNegotiableFromBuyRequests1742500200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "buy_requests" DROP COLUMN "is_budget_negotiable"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "buy_requests" ADD "is_budget_negotiable" boolean NOT NULL DEFAULT true`,
    );
  }
}
