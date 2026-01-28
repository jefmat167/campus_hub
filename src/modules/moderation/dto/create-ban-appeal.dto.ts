import {
  IsString,
  IsOptional,
  IsArray,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateBanAppealDto {
  @IsString()
  @MaxLength(3000)
  reason: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  evidence?: string[];
}
