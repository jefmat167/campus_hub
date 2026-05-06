import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsIn, IsNumberString } from 'class-validator';

export class AdminListUniversitiesDto {
  @ApiPropertyOptional({ description: 'Search by name, code, or state' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by active status (true/false)' })
  @IsOptional()
  @IsIn(['true', 'false'])
  isActive?: string;

  @ApiPropertyOptional({ description: 'Filter by type', enum: ['federal', 'state', 'private'] })
  @IsOptional()
  @IsIn(['federal', 'state', 'private'])
  type?: string;

  @ApiPropertyOptional({ description: 'Sort by field', enum: ['name', 'createdAt', 'state'] })
  @IsOptional()
  @IsIn(['name', 'createdAt', 'state'])
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
