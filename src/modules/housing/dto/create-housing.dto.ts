import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  IsDateString,
  MaxLength,
  MinLength,
  Min,
  Max,
  ArrayMaxSize,
} from 'class-validator';
import {
  HousingType,
  FurnishingStatus,
  GenderPreference,
} from '../../../database/entities/housing.entity';

export class CreateHousingDto {
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  title: string;

  @IsString()
  @MinLength(50)
  @MaxLength(5000)
  description: string;

  @IsEnum(HousingType)
  type: HousingType;

  @IsNumber()
  @Min(1000)
  pricePerMonth: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  pricePerYear?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  cautionFee?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  agentFee?: number;

  @IsString()
  @MaxLength(500)
  address: string;

  @IsString()
  @MaxLength(255)
  area: string;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsNumber()
  @Min(0)
  @Max(20)
  @IsOptional()
  bedrooms?: number;

  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  bathrooms?: number;

  @IsEnum(FurnishingStatus)
  @IsOptional()
  furnishing?: FurnishingStatus;

  @IsEnum(GenderPreference)
  @IsOptional()
  genderPreference?: GenderPreference;

  // Amenities
  @IsBoolean()
  @IsOptional()
  hasWater?: boolean;

  @IsBoolean()
  @IsOptional()
  hasElectricity?: boolean;

  @IsBoolean()
  @IsOptional()
  hasInternet?: boolean;

  @IsBoolean()
  @IsOptional()
  hasParking?: boolean;

  @IsBoolean()
  @IsOptional()
  hasSecurityGuard?: boolean;

  @IsBoolean()
  @IsOptional()
  hasGenerator?: boolean;

  @IsBoolean()
  @IsOptional()
  hasPrepaidMeter?: boolean;

  @IsBoolean()
  @IsOptional()
  isGated?: boolean;

  @IsBoolean()
  @IsOptional()
  allowsPets?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  otherAmenities?: string[];

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  imageUrls?: string[];

  @IsString()
  @IsOptional()
  videoUrl?: string;

  @IsString()
  @MaxLength(2000)
  @IsOptional()
  rules?: string;

  @IsDateString()
  @IsOptional()
  availableFrom?: string;
}
