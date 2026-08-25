import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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

export class CheckoutDto {
  @ApiProperty({ description: 'Your 6-digit transaction PIN', example: '135790' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  pin: string;

  @ApiProperty({
    description: 'One meet-up selection per seller in the cart',
    type: [MeetupSelectionDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MeetupSelectionDto)
  meetupSelections: MeetupSelectionDto[];

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
