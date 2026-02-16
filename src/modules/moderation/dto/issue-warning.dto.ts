import {
  IsEnum,
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WarningReason } from '../../../database/entities/warning.entity';

export class IssueWarningDto {
  @ApiProperty({
    description: 'Reason category for the warning',
    enum: WarningReason,
    example: WarningReason.POLICY_VIOLATION,
  })
  @IsEnum(WarningReason)
  reason: WarningReason;

  @ApiProperty({
    description: 'Warning message explaining the violation',
    example: 'Your listing was found to contain misleading information. Please ensure all listings accurately describe the item being sold.',
    maxLength: 2000,
  })
  @IsString()
  @MaxLength(2000)
  message: string;

  @ApiPropertyOptional({
    description: 'UUID of the related report (if warning stems from a report)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsUUID()
  reportId?: string;

  @ApiPropertyOptional({
    description: 'Number of days until warning expires (null for permanent)',
    example: 90,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  expiryDays?: number;
}
