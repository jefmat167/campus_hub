import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export const ALLOWED_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
] as const;

export class PresignedUrlItemDto {
  @ApiProperty({
    description: 'MIME type of the file',
    enum: ALLOWED_MEDIA_TYPES,
    example: 'image/jpeg',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(ALLOWED_MEDIA_TYPES)
  contentType: string;

  @ApiProperty({
    description: 'Original filename',
    example: 'photo1.jpg',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename: string;
}

export class GeneratePresignedUrlsDto {
  @ApiProperty({
    description: 'Array of files to generate presigned URLs for (max 5)',
    type: [PresignedUrlItemDto],
    example: [
      { contentType: 'image/jpeg', filename: 'photo1.jpg' },
      { contentType: 'video/mp4', filename: 'clip.mp4' },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => PresignedUrlItemDto)
  files: PresignedUrlItemDto[];
}
