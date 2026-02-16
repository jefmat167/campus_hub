import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  HousingType,
  FurnishingStatus,
  GenderPreference,
} from '../../../database/entities/housing.entity';

export class SearchHousingDto {
  @ApiPropertyOptional({
    description: 'Search term for title, description, or area',
    example: 'self-contain Akoka',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by housing type',
    enum: HousingType,
    example: HousingType.SELF_CONTAIN,
  })
  @IsEnum(HousingType)
  @IsOptional()
  type?: HousingType;

  @ApiPropertyOptional({
    description: 'Minimum monthly rent in Naira',
    example: 20000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum monthly rent in Naira',
    example: 50000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Filter by area/neighborhood',
    example: 'Akoka',
  })
  @IsString()
  @IsOptional()
  area?: string;

  @ApiPropertyOptional({
    description: 'Minimum number of bedrooms',
    example: 1,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  bedrooms?: number;

  @ApiPropertyOptional({
    description: 'Minimum number of bathrooms',
    example: 1,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  bathrooms?: number;

  @ApiPropertyOptional({
    description: 'Filter by furnishing status',
    enum: FurnishingStatus,
    example: FurnishingStatus.FURNISHED,
  })
  @IsEnum(FurnishingStatus)
  @IsOptional()
  furnishing?: FurnishingStatus;

  @ApiPropertyOptional({
    description: 'Filter by gender preference',
    enum: GenderPreference,
    example: GenderPreference.ANY,
  })
  @IsEnum(GenderPreference)
  @IsOptional()
  genderPreference?: GenderPreference;

  @ApiPropertyOptional({
    description: 'Must have water supply',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasWater?: boolean;

  @ApiPropertyOptional({
    description: 'Must have electricity',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasElectricity?: boolean;

  @ApiPropertyOptional({
    description: 'Must have internet',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasInternet?: boolean;

  @ApiPropertyOptional({
    description: 'Must have generator',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasGenerator?: boolean;

  @ApiPropertyOptional({
    description: 'Only show verified listings',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isVerified?: boolean;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : 1))
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    default: 20,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : 20))
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['price_asc', 'price_desc', 'newest', 'popular'],
    example: 'newest',
  })
  @IsString()
  @IsOptional()
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular';
}
