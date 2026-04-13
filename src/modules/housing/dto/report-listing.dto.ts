import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HousingReportReason } from '../../../database/entities/housing-report.entity';

export class ReportListingDto {
  @ApiProperty({
    description: 'Reason for reporting this listing',
    enum: HousingReportReason,
    example: HousingReportReason.FAKE_LISTING,
  })
  @IsEnum(HousingReportReason)
  reason: HousingReportReason;

  @ApiPropertyOptional({
    description: 'Optional additional context',
    example: 'I contacted the poster and the address does not exist.',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  details?: string;
}
