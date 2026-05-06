import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn, MinLength, MaxLength } from 'class-validator';

export class CreateUniversityDto {
  @ApiProperty({ example: 'University of Lagos' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'UNILAG' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ enum: ['federal', 'state', 'private'], example: 'federal' })
  @IsIn(['federal', 'state', 'private'])
  type: 'federal' | 'state' | 'private';
}
