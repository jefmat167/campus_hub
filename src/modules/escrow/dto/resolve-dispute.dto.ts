import {
  IsEnum,
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeStatus } from '../../../database/entities/dispute.entity';

export class ResolveDisputeDto {
  @ApiProperty({
    description: 'Resolution outcome for the dispute',
    enum: [DisputeStatus.RESOLVED_BUYER, DisputeStatus.RESOLVED_SELLER, DisputeStatus.RESOLVED_SPLIT],
    example: DisputeStatus.RESOLVED_SPLIT,
  })
  @IsEnum(DisputeStatus, {
    message: 'Resolution must be one of: resolved_buyer, resolved_seller, resolved_split',
  })
  resolution: DisputeStatus.RESOLVED_BUYER | DisputeStatus.RESOLVED_SELLER | DisputeStatus.RESOLVED_SPLIT;

  @ApiProperty({
    description: 'Admin notes explaining the resolution decision (minimum 10 characters)',
    example: 'Item was partially damaged. Splitting funds 70-30 in favor of buyer.',
    minLength: 10,
  })
  @IsString()
  @MinLength(10)
  resolutionNotes: string;

  @ApiPropertyOptional({
    description: 'Amount to refund to the buyer (required for split resolution)',
    example: 17500,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  buyerRefundAmount?: number;

  @ApiPropertyOptional({
    description: 'Amount to release to the seller (required for split resolution)',
    example: 7500,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  sellerReleaseAmount?: number;
}
