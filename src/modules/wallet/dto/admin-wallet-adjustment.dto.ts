import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsNumber, IsIn, IsString, MaxLength, Min } from 'class-validator';

export class AdminWalletAdjustmentDto {
  @ApiProperty({ description: 'Target user ID' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Amount in Naira', minimum: 1 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ description: 'Adjustment type', enum: ['credit', 'debit'] })
  @IsIn(['credit', 'debit'])
  type: 'credit' | 'debit';

  @ApiProperty({ description: 'Reason for adjustment', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;
}
