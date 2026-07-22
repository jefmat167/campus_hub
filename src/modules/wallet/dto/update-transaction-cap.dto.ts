import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min, ValidateIf } from 'class-validator';
import { VerificationTier } from '../../../database/entities/user.entity';
import {
  TransactionCapType,
  TransactionCapPeriod,
} from '../../../database/entities/transaction-cap.entity';

export class UpdateTransactionCapDto {
  @ApiProperty({ enum: VerificationTier, description: 'Tier the cap applies to' })
  @IsEnum(VerificationTier)
  tier: VerificationTier;

  @ApiProperty({ enum: TransactionCapType, description: 'spend = escrow purchases, withdrawal = payouts' })
  @IsEnum(TransactionCapType)
  capType: TransactionCapType;

  @ApiProperty({ enum: TransactionCapPeriod, description: 'Rolling window (only "daily" is enforced in v1)' })
  @IsEnum(TransactionCapPeriod)
  period: TransactionCapPeriod;

  @ApiProperty({
    nullable: true,
    minimum: 0,
    description: 'Cap amount in Naira; send null for unlimited',
  })
  // null = unlimited (skips numeric validation); any other value must be a
  // non-negative integer. `undefined` fails validation, so the field is required.
  @ValidateIf((o) => o.amount !== null)
  @IsInt()
  @Min(0)
  amount: number | null;
}
