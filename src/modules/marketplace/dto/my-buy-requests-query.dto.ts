import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { BuyRequestStatus } from '../../../database/entities/buy-request.entity';

/**
 * `GET /marketplace/requests/my-requests` query. Validated so a bad status or
 * a negative page/limit is a 400 rather than a Postgres error (500).
 */
export class MyBuyRequestsQueryDto {
  @ApiPropertyOptional({
    enum: BuyRequestStatus,
    description: 'Filter by request status',
    example: BuyRequestStatus.OPEN,
  })
  @IsEnum(BuyRequestStatus)
  @IsOptional()
  status?: BuyRequestStatus;

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
