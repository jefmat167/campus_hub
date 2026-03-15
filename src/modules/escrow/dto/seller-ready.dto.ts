import {
  IsDateString,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SellerReadyDto {
  @ApiProperty({
    description: 'Delivery date in YYYY-MM-DD format',
    example: '2026-03-10',
  })
  @IsDateString()
  deliveryDate: string;

  @ApiProperty({
    description: 'Delivery time in HH:MM format (24-hour)',
    example: '14:30',
  })
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'deliveryTime must be in HH:MM format (24-hour)',
  })
  deliveryTime: string;

  @ApiProperty({
    description: 'Delivery location description',
    example: 'Faculty of Engineering, near the main gate',
    minLength: 10,
    maxLength: 500,
  })
  @IsString()
  @MinLength(10, {
    message: 'deliveryLocation must be at least 10 characters',
  })
  @MaxLength(500, {
    message: 'deliveryLocation must not exceed 500 characters',
  })
  deliveryLocation: string;
}
