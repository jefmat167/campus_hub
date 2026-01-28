import {
  IsUUID,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOfferDto {
  @ApiProperty({
    description: 'UUID of the listing to make an offer on',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  listingId: string;

  @ApiProperty({
    description: 'Offer amount in Naira (₦)',
    example: 400000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  amount: number;

  @ApiPropertyOptional({
    description: 'Optional message to the seller',
    example: 'Hi, I am interested in this item. Can you do 400k?',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  message?: string;
}
