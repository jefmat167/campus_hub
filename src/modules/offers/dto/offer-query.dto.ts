import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { OfferStatus } from '../../../database/entities/offer.entity';

/**
 * `?status` filter shared by every offer list. Validated so a bad value is a
 * 400 instead of a Postgres enum-cast 500.
 */
export class OfferStatusQueryDto {
  @ApiPropertyOptional({
    enum: OfferStatus,
    description: 'Filter by offer status',
    example: OfferStatus.PENDING,
  })
  @IsEnum(OfferStatus)
  @IsOptional()
  status?: OfferStatus;
}

/** `?status&page&limit` for the paginated sent / received lists. */
export class OfferQueryDto extends OfferStatusQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;
}
