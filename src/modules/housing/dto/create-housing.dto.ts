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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  HousingType,
  FurnishingStatus,
  GenderPreference,
  PaymentFrequency,
  PosterRelationship,
} from '../../../database/entities/housing.entity';

export class CreateHousingDto {
  @ApiProperty({
    description: 'Listing title (10-255 characters)',
    example: 'Spacious Self-Contain Near UNILAG Main Gate',
    minLength: 10,
    maxLength: 255,
  })
  @IsString()
  @MinLength(10)
  @MaxLength(255)
  title: string;

  @ApiProperty({
    description: 'Detailed description of the property (50-5000 characters)',
    example: 'Well-maintained self-contain apartment with 24/7 water supply, prepaid meter, and excellent security. Located 5 minutes walk from the main gate. Perfect for students who value privacy and convenience.',
    minLength: 50,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(50)
  @MaxLength(5000)
  description: string;

  @ApiProperty({
    description: 'Type of housing',
    enum: HousingType,
    example: HousingType.SELF_CONTAIN,
  })
  @IsEnum(HousingType)
  type: HousingType;

  @ApiProperty({
    description:
      'Your relationship to this listing. Signals credibility to students browsing (current tenant = firsthand, past tenant = recent firsthand, knows landlord = third-party).',
    enum: PosterRelationship,
    example: PosterRelationship.CURRENT_TENANT,
  })
  @IsEnum(PosterRelationship)
  posterRelationship: PosterRelationship;

  @ApiProperty({
    description: 'Rent price in Naira (amount per payment frequency)',
    example: 400000,
    minimum: 1000,
  })
  @IsNumber()
  @Min(1000)
  price: number;

  @ApiProperty({
    description: 'How frequently rent payments are made',
    enum: PaymentFrequency,
    example: PaymentFrequency.YEARLY,
  })
  @IsEnum(PaymentFrequency)
  paymentFrequency: PaymentFrequency;

  @ApiPropertyOptional({
    description: 'Refundable caution/security deposit in Naira',
    example: 35000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  cautionFee?: number;

  @ApiPropertyOptional({
    description: 'Agent/service fee in Naira',
    example: 17500,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  agentFee?: number;

  @ApiProperty({
    description: 'Full address of the property',
    example: '15 University Road, Akoka, Lagos',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  address: string;

  @ApiProperty({
    description: 'Area/neighborhood name',
    example: 'Akoka',
    maxLength: 255,
  })
  @IsString()
  @MaxLength(255)
  area: string;

  @ApiPropertyOptional({
    description: 'GPS latitude coordinate',
    example: 6.5244,
  })
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({
    description: 'GPS longitude coordinate',
    example: 3.3792,
  })
  @IsNumber()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional({
    description: 'Number of bedrooms',
    example: 1,
    minimum: 0,
    maximum: 20,
  })
  @IsNumber()
  @Min(0)
  @Max(20)
  @IsOptional()
  bedrooms?: number;

  @ApiPropertyOptional({
    description: 'Number of bathrooms',
    example: 1,
    minimum: 0,
    maximum: 10,
  })
  @IsNumber()
  @Min(0)
  @Max(10)
  @IsOptional()
  bathrooms?: number;

  @ApiPropertyOptional({
    description: 'Furnishing status',
    enum: FurnishingStatus,
    example: FurnishingStatus.SEMI_FURNISHED,
  })
  @IsEnum(FurnishingStatus)
  @IsOptional()
  furnishing?: FurnishingStatus;

  @ApiPropertyOptional({
    description: 'Gender preference for tenants',
    enum: GenderPreference,
    example: GenderPreference.ANY,
  })
  @IsEnum(GenderPreference)
  @IsOptional()
  genderPreference?: GenderPreference;

  @ApiPropertyOptional({
    description: 'Has running water supply',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  hasWater?: boolean;

  @ApiPropertyOptional({
    description: 'Has electricity connection',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  hasElectricity?: boolean;

  @ApiPropertyOptional({
    description: 'Has internet/WiFi',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  hasInternet?: boolean;

  @ApiPropertyOptional({
    description: 'Has parking space',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  hasParking?: boolean;

  @ApiPropertyOptional({
    description: 'Has security guard',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  hasSecurityGuard?: boolean;

  @ApiPropertyOptional({
    description: 'Has backup generator',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  hasGenerator?: boolean;

  @ApiPropertyOptional({
    description: 'Has prepaid electricity meter',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  hasPrepaidMeter?: boolean;

  @ApiPropertyOptional({
    description: 'Is in a gated compound',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isGated?: boolean;

  @ApiPropertyOptional({
    description: 'Allows pets',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  allowsPets?: boolean;

  @ApiPropertyOptional({
    description: 'Other amenities not covered above',
    example: ['Washing machine', 'Water heater', 'Air conditioning'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  otherAmenities?: string[];

  @ApiPropertyOptional({
    description: 'URLs of property images (max 20)',
    example: ['https://storage.example.com/housing/img1.jpg', 'https://storage.example.com/housing/img2.jpg'],
    type: [String],
    maxItems: 20,
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: 'URL to property video tour',
    example: 'https://storage.example.com/housing/video1.mp4',
  })
  @IsString()
  @IsOptional()
  videoUrl?: string;

  @ApiPropertyOptional({
    description: 'House rules and restrictions',
    example: 'No loud music after 10pm. No overnight guests without prior notice.',
    maxLength: 2000,
  })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  rules?: string;

  @ApiPropertyOptional({
    description: 'Date when the property becomes available (ISO 8601)',
    example: '2024-02-01',
  })
  @IsDateString()
  @IsOptional()
  availableFrom?: string;
}
