import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsArray,
  IsUrl,
  Min,
  Max,
  MaxLength,
  MinLength,
  ArrayMaxSize,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ListingCategory,
  ListingCondition,
  VisibilityScope,
  DeliveryOption,
  ListingStatus,
} from '../../../database/entities/listing.entity';

export class UpdateListingDto {
  @ApiPropertyOptional({
    description: 'Title of the listing',
    example: 'iPhone 13 Pro Max - 256GB - Price Reduced!',
    minLength: 5,
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MinLength(5)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the item',
    example: 'Updated description with more details about the item condition...',
    minLength: 20,
    maxLength: 5000,
  })
  @IsString()
  @IsOptional()
  @MinLength(20)
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  description?: string;

  @ApiPropertyOptional({
    description: 'Category of the item',
    enum: ListingCategory,
    example: ListingCategory.ELECTRONICS,
  })
  @IsEnum(ListingCategory)
  @IsOptional()
  category?: ListingCategory;

  @ApiPropertyOptional({
    description: 'Condition of the item',
    enum: ListingCondition,
    example: ListingCondition.USED_GOOD,
  })
  @IsEnum(ListingCondition)
  @IsOptional()
  condition?: ListingCondition;

  @ApiPropertyOptional({
    description: 'Price in Naira (₦)',
    example: 400000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({
    description: 'Whether the price is negotiable',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  isNegotiable?: boolean;

  @ApiPropertyOptional({
    description: 'Who can see this listing',
    enum: VisibilityScope,
    example: VisibilityScope.UNIVERSITY,
  })
  @IsEnum(VisibilityScope)
  @IsOptional()
  visibilityScope?: VisibilityScope;

  @ApiPropertyOptional({
    description: 'Restrict to specific faculty',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

  @ApiPropertyOptional({
    description: 'Restrict to specific department',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'How the item can be delivered',
    enum: DeliveryOption,
    example: DeliveryOption.DELIVERY_AVAILABLE,
  })
  @IsEnum(DeliveryOption)
  @IsOptional()
  deliveryOption?: DeliveryOption;

  @ApiPropertyOptional({
    description: 'Preferred meetup location',
    example: 'Library entrance, 2pm-5pm',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  meetupLocation?: string;

  @ApiPropertyOptional({
    description: 'Array of image URLs to add (max 5 total images per listing)',
    example: [
      'https://storage.example.com/listings/new-img1.jpg',
      'https://storage.example.com/listings/new-img2.jpg',
    ],
    type: [String],
    maxItems: 5,
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  @IsOptional()
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: 'Listing status',
    enum: ListingStatus,
    example: ListingStatus.ACTIVE,
  })
  @IsEnum(ListingStatus)
  @IsOptional()
  status?: ListingStatus;
}
