import {
  IsString,
  IsOptional,
  MaxLength,
  IsEnum,
  IsUrl,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { YearOfStudy } from '../../../database/entities/user.entity';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'Full name of the user',
    example: 'John Doe',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  fullName?: string;

  @ApiPropertyOptional({
    description: 'Short bio about the user',
    example: 'Final year Computer Science student. Love building apps!',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @ApiPropertyOptional({
    description: 'Current year of study',
    enum: YearOfStudy,
    example: YearOfStudy.YEAR_4,
  })
  @IsOptional()
  @IsEnum(YearOfStudy)
  yearOfStudy?: YearOfStudy;

  @ApiPropertyOptional({
    description: 'URL to profile photo',
    example: 'https://storage.example.com/avatars/user123.jpg',
  })
  @IsOptional()
  @IsString()
  @IsUrl()
  profilePhotoUrl?: string;
}
