import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Door 1 (spec 03.1): an existing Tier-2 student applies for the vendor role.
 * Identity is already BVN/NIN-verified, so the application carries the
 * shopfront photo directly and lands in the review queue in one step.
 */
export class ApplyVendorDto {
  @ApiProperty({
    description: 'Public storefront name',
    example: "Mama T's Kitchen",
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  businessName: string;

  @ApiPropertyOptional({
    description: 'What the business sells / does',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    description:
      'Where the shop physically is — must be one of servedUniversityIds',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  homeUniversityId: string;

  @ApiProperty({
    description: 'The 1–3 universities this vendor serves (must include home)',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  servedUniversityIds: string[];

  @ApiProperty({
    description: 'Live-captured shopfront photo (uploaded via /upload first)',
    maxLength: 500,
  })
  @IsUrl()
  @MaxLength(500)
  shopfrontPhotoUrl: string;

  @ApiProperty({
    description:
      'Must be true — the shopfront photo has to be captured live in-app (rev-2 spec 03.1)',
    example: true,
  })
  @IsBoolean()
  @Equals(true, {
    message: 'The shopfront photo must be captured live in-app',
  })
  photoCapturedLive: boolean;
}
