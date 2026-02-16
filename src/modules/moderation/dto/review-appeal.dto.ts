import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BanAppealStatus } from '../../../database/entities/ban-appeal.entity';

export class ReviewAppealDto {
  @ApiProperty({
    description: 'Decision on the ban appeal',
    enum: [BanAppealStatus.APPROVED, BanAppealStatus.REJECTED],
    example: BanAppealStatus.REJECTED,
  })
  @IsEnum(BanAppealStatus, {
    message: 'Status must be approved or rejected',
  })
  status: BanAppealStatus.APPROVED | BanAppealStatus.REJECTED;

  @ApiPropertyOptional({
    description: 'Notes explaining the appeal decision',
    example: 'Appeal rejected. Evidence provided does not sufficiently address the policy violations.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;
}
