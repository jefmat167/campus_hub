import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/**
 * Partial update of a university's money settings. Omitted keys are left
 * untouched; an explicit null clears that override back to the platform
 * default.
 */
export class UpdateUniversitySettingsDto {
  @ApiPropertyOptional({
    description:
      'P2P-market platform fee % for this university. null clears the override (platform default applies).',
    example: 2.5,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  p2pFeePercent?: number | null;

  @ApiPropertyOptional({
    description:
      "Vendors'-market platform fee % for this university. null clears the override.",
    example: 2.5,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  vendorFeePercent?: number | null;

  @ApiPropertyOptional({
    description:
      'Post-ready buyer-cancellation fee % for this university. null clears the override.',
    example: 10,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  cancellationFeePercent?: number | null;

  @ApiPropertyOptional({
    description:
      'Whether the post-ready cancellation fee is charged at all. null clears the override.',
    example: true,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsBoolean()
  cancellationFeeEnabled?: boolean | null;
}
