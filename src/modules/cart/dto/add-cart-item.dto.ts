import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

/**
 * Exactly one of listingId / offerId (service-enforced):
 * - listingId → any listing on the unified marketplace at its listed price:
 *   a student's P2P item (always quantity 1), vendor goods (quantity +
 *   options), or a service booking (always quantity 1; the appointment time
 *   is proposed at checkout)
 * - offerId   → a P2P listing at an ACCEPTED offer's agreed price (24h lock)
 */
export class AddCartItemDto {
  @ApiPropertyOptional({
    description: 'Listing to add (any kind) at its listed / base price',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @ApiPropertyOptional({
    description:
      "Accepted offer to add at the agreed price (must be yours, within its 24h lock)",
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  offerId?: string;

  @ApiPropertyOptional({
    description: 'Quantity (vendor goods only; P2P and services are always 1)',
    example: 2,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  quantity?: number;

  @ApiPropertyOptional({
    description:
      "Selected option ids across the listing's option groups (vendor listings)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  selectedOptionIds?: string[];
}
