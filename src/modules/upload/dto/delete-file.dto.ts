import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DeleteFileDto {
  @ApiProperty({
    example: 'listings/<your-user-id>/9b1c…-photo.jpg',
    description: 'publicId from the UploadResult (must be one of your own uploads)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  publicId: string;

  @ApiProperty({ enum: ['S3', 'CLOUDINARY'], description: 'provider from the UploadResult' })
  @IsIn(['S3', 'CLOUDINARY'])
  provider: 'S3' | 'CLOUDINARY';
}
