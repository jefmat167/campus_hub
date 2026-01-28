import {
  IsEnum,
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { ReportType, ReportReason } from '../../../database/entities/report.entity';

export class CreateReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsUUID()
  targetId: string;

  @IsEnum(ReportReason)
  reason: ReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  evidence?: string[];
}
