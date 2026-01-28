import {
  IsString,
  IsNotEmpty,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ListingCategory,
  ListingCondition,
  VisibilityScope,
  DeliveryOption,
  ListingType,
} from '../../../database/entities/listing.entity';

export class CreateListingDto {
  @ApiPropertyOptional({
    description: 'Type of listing',
    enum: ListingType,
    default: ListingType.SELL,
    example: ListingType.SELL,
  })
  @IsEnum(ListingType)
  @IsOptional()
  type?: ListingType = ListingType.SELL;

  @ApiProperty({
    description: 'Title of the listing',
    example: 'iPhone 13 Pro Max - 256GB - Like New',
    minLength: 5,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiProperty({
    description: 'Detailed description of the item',
    example: 'Selling my iPhone 13 Pro Max, 256GB storage, Sierra Blue color. Used for 6 months, always with screen protector and case. Battery health at 98%. Comes with original box, charger, and cable. No scratches or dents.',
    minLength: 20,
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(1000)
  @Transform(({ value }) => value?.trim())
  description: string;

  @ApiProperty({
    description: 'Category of the item',
    enum: ListingCategory,
    example: ListingCategory.ELECTRONICS,
  })
  @IsEnum(ListingCategory)
  category: ListingCategory;

  @ApiProperty({
    description: 'Condition of the item',
    enum: ListingCondition,
    example: ListingCondition.LIKE_NEW,
  })
  @IsEnum(ListingCondition)
  condition: ListingCondition;

  @ApiProperty({
    description: 'Price in Naira (₦)',
    example: 450000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  price: number;

  @ApiPropertyOptional({
    description: 'Whether the price is negotiable',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isNegotiable?: boolean = true;

  @ApiPropertyOptional({
    description: 'Who can see this listing',
    enum: VisibilityScope,
    default: VisibilityScope.UNIVERSITY,
    example: VisibilityScope.UNIVERSITY,
  })
  @IsEnum(VisibilityScope)
  @IsOptional()
  visibilityScope?: VisibilityScope = VisibilityScope.UNIVERSITY;

  @ApiPropertyOptional({
    description: 'Restrict to specific faculty (if visibility is FACULTY)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

  @ApiPropertyOptional({
    description: 'Restrict to specific department (if visibility is DEPARTMENT)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'How the item can be delivered',
    enum: DeliveryOption,
    default: DeliveryOption.MEETUP,
    example: DeliveryOption.MEETUP,
  })
  @IsEnum(DeliveryOption)
  @IsOptional()
  deliveryOption?: DeliveryOption = DeliveryOption.MEETUP;

  @ApiPropertyOptional({
    description: 'Preferred meetup location',
    example: 'Faculty of Science Building, Ground Floor',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  meetupLocation?: string;

  @ApiPropertyOptional({
    description: 'Array of image URLs (max 5)',
    example: [
      'https://storage.example.com/listings/img1.jpg',
      'https://storage.example.com/listings/img2.jpg',
    ],
    type: [String],
    maxItems: 5,
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  @IsOptional()
  imageUrls?: string[];
}
