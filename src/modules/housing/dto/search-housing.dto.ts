import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  HousingType,
  FurnishingStatus,
  GenderPreference,
} from '../../../database/entities/housing.entity';

export class SearchHousingDto {
  @IsString()
  @IsOptional()
  search?: string;

  @IsEnum(HousingType)
  @IsOptional()
  type?: HousingType;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  minPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  maxPrice?: number;

  @IsString()
  @IsOptional()
  area?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  bedrooms?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  bathrooms?: number;

  @IsEnum(FurnishingStatus)
  @IsOptional()
  furnishing?: FurnishingStatus;

  @IsEnum(GenderPreference)
  @IsOptional()
  genderPreference?: GenderPreference;

  // Amenity filters
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasWater?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasElectricity?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasInternet?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  hasGenerator?: boolean;

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isVerified?: boolean;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : 1))
  page?: number;

  @IsNumber()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : 20))
  limit?: number;

  @IsString()
  @IsOptional()
  sortBy?: 'price_asc' | 'price_desc' | 'newest' | 'popular';
}
