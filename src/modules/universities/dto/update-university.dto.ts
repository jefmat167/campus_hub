import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MinLength, MaxLength } from 'class-validator';

export class UpdateUniversityDto {
  @ApiPropertyOptional({ example: 'University of Lagos' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'UNILAG' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: ['federal', 'state', 'private'] })
  @IsOptional()
  @IsIn(['federal', 'state', 'private'])
  type?: 'federal' | 'state' | 'private';
}
