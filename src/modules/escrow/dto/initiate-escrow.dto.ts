import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
