import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ReportAction } from '../../../database/entities/report.entity';

export class ReviewReportDto {
  @IsEnum(ReportAction)
  action: ReportAction;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;

  // Optional: ban duration in days (for temp bans)
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  banDurationDays?: number;
}
