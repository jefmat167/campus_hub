import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  IsUrl,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ListingCondition } from '../../../database/entities/listing.entity';

export class CreateBuyRequestOfferDto {
  @ApiProperty({
    description: 'Your proposed price in Naira (should be within requester budget range)',
    example: 45000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  proposedPrice: number;

  @ApiProperty({
    description: 'Condition of your item',
    enum: ListingCondition,
    example: ListingCondition.LIKE_NEW,
  })
  @IsEnum(ListingCondition)
  itemCondition: ListingCondition;

  @ApiPropertyOptional({
    description: 'Message to the requester explaining your offer',
    example: 'I have exactly what you are looking for - a MacBook Pro 2021, barely used.',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  message?: string;

  @ApiPropertyOptional({
    description: 'URL to an image of your item (optional proof)',
    example: 'https://storage.example.com/item-photo.jpg',
    maxLength: 500,
  })
  @IsUrl()
  @IsOptional()
  @MaxLength(500)
  imageUrl?: string;
}
