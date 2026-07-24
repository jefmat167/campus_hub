import { IsDateString, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SellerReadyDto {
  @ApiPropertyOptional({
    description: 'Delivery date in YYYY-MM-DD format — required for meet-up delivery',
    example: '2026-03-10',
  })
  @IsDateString()
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional({
    description: 'Delivery time in HH:MM (24-hour) — required for meet-up delivery',
    example: '14:30',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'deliveryTime must be in HH:MM format (24-hour)',
  })
  @IsOptional()
  deliveryTime?: string;
}
