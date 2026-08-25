import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/**
 * Exactly one of listingId / offerId (service-enforced):
 * - listingId → add at the listed price
 * - offerId   → add at the ACCEPTED offer's agreed price (24h lock, spec 01.6)
 */
export class AddCartItemDto {
  @ApiPropertyOptional({
    description: 'Listing to add at its listed price',
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
}
