import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryMethod } from '../../../database/entities/listing.entity';

export class InitiateEscrowDto {
  @ApiProperty({
    description: 'UUID of the listing to purchase',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  listingId: string;

  @ApiPropertyOptional({
    description: 'UUID of an accepted offer (if purchasing via offer)',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsUUID()
  @IsOptional()
  offerId?: string;

  @ApiProperty({
    description: 'Amount to pay for the item (excluding platform fee)',
    example: 25000,
  })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({
    description: 'Optional notes for the seller',
    example: 'Please include the charger',
  })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiProperty({
    description: 'Chosen delivery method (must be one the listing offers)',
    enum: DeliveryMethod,
    example: DeliveryMethod.MEETUP,
  })
  @IsEnum(DeliveryMethod)
  deliveryMethod: DeliveryMethod;

  @ApiPropertyOptional({
    description:
      'Index of the chosen meet-up point (required when deliveryMethod = meetup)',
    example: 0,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  meetupPointIndex?: number;

  @ApiProperty({
    description: 'Your 6-digit transaction PIN',
    example: '135790',
  })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  pin: string;
}
