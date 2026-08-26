import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One meet-up choice per SELLER in the cart, identified by any one of that
 * seller's listings: the sub-order's handover happens at the chosen point of
 * that listing (one checkout, one code, one meetup per seller — spec 02.1).
 */
export class MeetupSelectionDto {
  @ApiProperty({
    description: "A listing belonging to the seller this selection is for",
    format: 'uuid',
  })
  @IsUUID()
  listingId: string;

  @ApiProperty({
    description: "Index into that listing's meetupPoints",
    example: 0,
  })
  @IsInt()
  @Min(0)
  meetupPointIndex: number;
}

/**
 * One fulfillment choice per VENDOR in the cart (rev-2 spec 03.2): pickup at
 * the shop (always available), or delivery — to an address at the vendor's
 * home university, or to an admin drop point (mandatory for neighboring
 * universities). Chosen once per vendor sub-order, not per item.
 */
export class VendorFulfillmentChoiceDto {
  @ApiProperty({ description: 'The vendor this choice is for', format: 'uuid' })
  @IsUUID()
  vendorProfileId: string;

  @ApiProperty({ enum: ['pickup', 'delivery'], example: 'delivery' })
  @IsIn(['pickup', 'delivery'])
  method: 'pickup' | 'delivery';

  @ApiPropertyOptional({
    description:
      'Admin drop point at YOUR university (required for delivery from a neighboring-campus vendor; optional alternative at home)',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  dropPointId?: string;

  @ApiPropertyOptional({
    description:
      "Delivery address (only when the vendor's home university is yours)",
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryAddress?: string;
}

export class CheckoutDto {
  @ApiProperty({ description: 'Your 6-digit transaction PIN', example: '135790' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  pin: string;

  @ApiPropertyOptional({
    description: 'One meet-up selection per P2P seller in the cart',
    type: [MeetupSelectionDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeetupSelectionDto)
  meetupSelections?: MeetupSelectionDto[];

  @ApiPropertyOptional({
    description: 'One fulfillment choice per vendor in the cart',
    type: [VendorFulfillmentChoiceDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VendorFulfillmentChoiceDto)
  vendorFulfillment?: VendorFulfillmentChoiceDto[];

  @ApiPropertyOptional({
    description: 'Optional note to the sellers',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

/** Buy-now: a one-line checkout without touching the cart. */
export class DirectCheckoutDto {
  @ApiProperty({ description: 'Listing to buy', format: 'uuid' })
  @IsUUID()
  listingId: string;

  @ApiPropertyOptional({
    description:
      "Accepted offer to buy at the agreed price (yours, within its 24h lock)",
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  offerId?: string;

  @ApiProperty({
    description: "Index into the listing's meetupPoints",
    example: 0,
  })
  @IsInt()
  @Min(0)
  meetupPointIndex: number;

  @ApiProperty({ description: 'Your 6-digit transaction PIN', example: '135790' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  pin: string;

  @ApiPropertyOptional({ description: 'Optional note to the seller', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
