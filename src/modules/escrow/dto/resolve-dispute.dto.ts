import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MinLength,
} from 'class-validator';
import { DisputeStatus } from '../../../database/entities/dispute.entity';

export class ResolveDisputeDto {
  @IsEnum(DisputeStatus, {
    message: 'Resolution must be one of: resolved_buyer, resolved_seller, resolved_split',
  })
  resolution: DisputeStatus.RESOLVED_BUYER | DisputeStatus.RESOLVED_SELLER | DisputeStatus.RESOLVED_SPLIT;

  @IsString()
  @MinLength(10)
  resolutionNotes: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  buyerRefundAmount?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  sellerReleaseAmount?: number;
}
