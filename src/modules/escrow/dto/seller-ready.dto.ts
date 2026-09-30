import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SellerReadyDto {
  @ApiPropertyOptional({
    description: 'Delivery date in YYYY-MM-DD format — required for meet-up delivery',
    example: '2026-03-10',
  })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'deliveryDate must be in YYYY-MM-DD format',
  })
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional({
    description: 'Delivery time in HH:MM (24-hour, Lagos time) — required for meet-up delivery',
    example: '14:30',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'deliveryTime must be in HH:MM format (24-hour)',
  })
  @IsOptional()
  deliveryTime?: string;

  @ApiPropertyOptional({
    description:
      'Meet-up location. Required — and only accepted — for buy-request orders, which have no meet-up point snapshotted at order time (checkout orders carry the buyer\'s chosen point and reject this field).',
    example: 'Faculty of Engineering, near the main gate',
    minLength: 3,
    maxLength: 500,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  deliveryLocation?: string;
}
