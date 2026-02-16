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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostVisibility } from '../../../database/entities/post.entity';

export class PollOptionDto {
  @ApiProperty({
    description: 'Text for this poll option',
    example: 'Option A',
    minLength: 1,
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  text: string;
}

export class CreatePollDto {
  @ApiProperty({
    description: 'Poll question (5-500 characters)',
    example: 'What is the best cafeteria on campus?',
    minLength: 5,
    maxLength: 500,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  question: string;

  @ApiProperty({
    description: 'Poll options (2-10 options)',
    type: [PollOptionDto],
    example: [{ text: 'Main Cafeteria' }, { text: 'Faculty Canteen' }, { text: 'Student Union' }],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PollOptionDto)
  @ArrayMinSize(2)
  @ArrayMaxSize(10)
  options: PollOptionDto[];

  @ApiPropertyOptional({
    description: 'Whether users can select multiple options',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  allowMultipleVotes?: boolean;

  @ApiPropertyOptional({
    description: 'When the poll should close (ISO 8601 date string)',
    example: '2024-12-31T23:59:59.000Z',
  })
  @IsDateString()
  @IsOptional()
  endsAt?: string;
}

export class CreatePostDto {
  @ApiProperty({
    description: 'Post content (1-5000 characters)',
    example: 'Has anyone taken Prof. Adeyemi\'s CS301 class? Looking for study group members!',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({
    description: 'Visibility scope of the post',
    enum: PostVisibility,
    example: PostVisibility.UNIVERSITY,
    default: PostVisibility.UNIVERSITY,
  })
  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;

  @ApiPropertyOptional({
    description: 'URLs of images to attach (max 5)',
    example: ['https://storage.example.com/posts/image1.jpg'],
    type: [String],
    maxItems: 5,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMaxSize(5)
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: 'Optional poll to include with the post',
    type: CreatePollDto,
  })
  @ValidateNested()
  @Type(() => CreatePollDto)
  @IsOptional()
  poll?: CreatePollDto;
}
