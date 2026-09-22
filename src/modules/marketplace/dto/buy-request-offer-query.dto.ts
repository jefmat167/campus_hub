import { IsOptional, IsEnum, IsInt, IsUUID, Min, Max } from 'class-validator';
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

/**
 * `GET /marketplace/offers/my-responses`: additionally narrow to one buy
 * request, so a request's detail page can ask "what is MY offer here?" without
 * paging through everything the responder ever sent.
 */
export class MyResponsesQueryDto extends BuyRequestOfferQueryDto {
  @ApiPropertyOptional({
    description: 'Only offers I made on this buy request',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  buyRequestId?: string;
}
