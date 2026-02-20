import { IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BuyRequestOfferStatus } from '../../../database/entities/buy-request-offer.entity';

export class BuyRequestOfferQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: BuyRequestOfferStatus,
  })
  @IsEnum(BuyRequestOfferStatus)
  @IsOptional()
  status?: BuyRequestOfferStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;
}
