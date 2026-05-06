import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsDateString } from 'class-validator';

export class StatsQueryDto {
  @ApiPropertyOptional({ description: 'Start date for time-scoped stats (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date for time-scoped stats (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
