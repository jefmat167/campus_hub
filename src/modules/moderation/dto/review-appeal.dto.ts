import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { BanAppealStatus } from '../../../database/entities/ban-appeal.entity';

export class ReviewAppealDto {
  @IsEnum(BanAppealStatus, {
    message: 'Status must be approved or rejected',
  })
  status: BanAppealStatus.APPROVED | BanAppealStatus.REJECTED;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;
}
