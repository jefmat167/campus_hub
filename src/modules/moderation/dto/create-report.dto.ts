import {
  IsEnum,
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportType, ReportReason } from '../../../database/entities/report.entity';

export class CreateReportDto {
  @ApiProperty({
    description: 'Type of content being reported',
    enum: ReportType,
    example: ReportType.LISTING,
  })
  @IsEnum(ReportType)
  type: ReportType;

  @ApiProperty({
    description: 'UUID of the content being reported',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  targetId: string;

  @ApiProperty({
    description: 'Reason for the report',
    enum: ReportReason,
    example: ReportReason.SCAM,
  })
  @IsEnum(ReportReason)
  reason: ReportReason;

  @ApiPropertyOptional({
    description: 'Detailed description of the issue',
    example: 'This seller is asking for payment outside the platform and the listing seems fake.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    description: 'URLs to screenshots or evidence',
    example: ['https://storage.example.com/evidence/screenshot1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  evidence?: string[];
}
