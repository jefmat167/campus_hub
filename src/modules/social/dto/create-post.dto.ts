import {
  IsString,
  IsEnum,
  IsArray,
  IsOptional,
  MaxLength,
  MinLength,
  IsBoolean,
  IsDateString,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PostVisibility } from '../../../database/entities/post.entity';

export class PollOptionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text: string;
}

export class CreatePollDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  question: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  options: PollOptionDto[];

  @IsBoolean()
  @IsOptional()
  allowMultipleVotes?: boolean;

  @IsDateString()
  @IsOptional()
  endsAt?: string;
}

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(5)
  imageUrls?: string[];

  @ValidateNested()
  @Type(() => CreatePollDto)
  @IsOptional()
  poll?: CreatePollDto;
}
