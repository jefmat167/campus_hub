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
 * Exactly one of listingId / offerId / vendorListingId (service-enforced):
 * - listingId       → P2P listing at its listed price
 * - offerId         → P2P listing at an ACCEPTED offer's agreed price (24h lock)
 * - vendorListingId → vendor goods, with quantity + selected options
 */
export class AddCartItemDto {
  @ApiPropertyOptional({
    description: 'P2P listing to add at its listed price',
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
    description: 'Vendor goods listing to add',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  vendorListingId?: string;

  @ApiPropertyOptional({
    description: 'Quantity (vendor lines only; P2P is always 1)',
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
      "Selected option ids across the listing's option groups (vendor lines)",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsUUID(undefined, { each: true })
  selectedOptionIds?: string[];
}
