import {
  IsEnum,
  IsString,
  IsArray,
  IsOptional,
  MinLength,
} from 'class-validator';
import { DisputeReason } from '../../../database/entities/dispute.entity';

export class OpenDisputeDto {
  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @IsString()
  @MinLength(20)
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidence?: string[];
}
