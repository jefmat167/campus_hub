import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/** Partial update; served-universities invariants re-validated on change. */
export class UpdateVendorProfileDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  businessName?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'New home university — must be (or become) one of the served universities',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  homeUniversityId?: string;

  @ApiPropertyOptional({
    description: 'Replacement served-universities list (1–3, must include home)',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  servedUniversityIds?: string[];
}
