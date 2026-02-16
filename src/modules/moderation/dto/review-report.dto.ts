import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportAction } from '../../../database/entities/report.entity';

export class ReviewReportDto {
  @ApiProperty({
    description: 'Action to take on the reported content',
    enum: ReportAction,
    example: ReportAction.WARNING_ISSUED,
  })
  @IsEnum(ReportAction)
  action: ReportAction;

  @ApiPropertyOptional({
    description: 'Notes explaining the review decision',
    example: 'Listing was found to be misleading. Issuing warning to seller.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;

  @ApiPropertyOptional({
    description: 'Duration of temporary ban in days (if action is temp ban)',
    example: 7,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  banDurationDays?: number;
}
