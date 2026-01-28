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
import { WarningReason } from '../../../database/entities/warning.entity';

export class IssueWarningDto {
  @IsEnum(WarningReason)
  reason: WarningReason;

  @IsString()
  @MaxLength(2000)
  message: string;

  // Link to a report if warning comes from report review
  @IsOptional()
  @IsUUID()
  reportId?: string;

  // Warning expiry in days (optional)
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  expiryDays?: number;
}
