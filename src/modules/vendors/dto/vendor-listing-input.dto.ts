import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ListingCategory,
  ListingKind,
  ListingStatus,
} from '../../../database/entities/listing.entity';
import { OptionSelectionType } from '../../../database/entities/vendor-option.entity';

export class VendorOptionInputDto {
  @ApiProperty({ example: 'Large', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiPropertyOptional({
    description: 'Naira added on top of the base price (0 = no change)',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10000000)
  priceDelta?: number;

  @ApiPropertyOptional({
    description: 'Per-option stock. Omit/null = untracked; 0 = sold out.',
    example: 12,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  stock?: number | null;
}

export class VendorOptionGroupInputDto {
  @ApiProperty({ example: 'Size', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiProperty({ enum: OptionSelectionType, example: OptionSelectionType.SINGLE })
  @IsEnum(OptionSelectionType)
  selectionType: OptionSelectionType;

  @ApiProperty({
    description:
      'Required groups gate purchase; a required group with every tracked option at 0 makes the listing show sold out',
    example: true,
  })
  @IsBoolean()
  required: boolean;

  @ApiProperty({ type: [VendorOptionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => VendorOptionInputDto)
  options: VendorOptionInputDto[];
}

export class CreateVendorListingDto {
  @ApiProperty({
    description: 'Shop item or bookable service',
    enum: [ListingKind.VENDOR_GOODS, ListingKind.VENDOR_SERVICE],
    example: ListingKind.VENDOR_GOODS,
  })
  @IsIn([ListingKind.VENDOR_GOODS, ListingKind.VENDOR_SERVICE])
  kind: ListingKind.VENDOR_GOODS | ListingKind.VENDOR_SERVICE;

  @ApiProperty({ example: 'Jollof rice (party pack)', minLength: 2, maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  title: string;

  @ApiProperty({ minLength: 10, maxLength: 1000 })
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description: string;

  @ApiProperty({ enum: ListingCategory, example: ListingCategory.FOOD })
  @IsEnum(ListingCategory)
  category: ListingCategory;

  @ApiProperty({ description: 'Base price in naira (before option deltas)', example: 3500 })
  @IsNumber()
  @IsPositive()
  @Max(10000000)
  price: number;

  @ApiPropertyOptional({
    description:
      'Base stock (goods only). Omit = untracked, which FORCES manual confirmation (rev-2 03.5). Services never carry stock.',
    example: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({
    description:
      'Require manual order confirmation. Forced true for services and for untracked stock; explicit false with untracked stock is a 400.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  manualConfirm?: boolean;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({ type: [VendorOptionGroupInputDto], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => VendorOptionGroupInputDto)
  optionGroups?: VendorOptionGroupInputDto[];

  @ApiPropertyOptional({
    description:
      'Opt this ONE listing out of your delivery preset (PUT /vendors/me/delivery): goods are pickup-only, services at-the-shop only. Default false = inherits the preset.',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  pickupOnly?: boolean;
}

export class UpdateVendorListingDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  title?: string;

  @ApiPropertyOptional({ minLength: 10, maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ enum: ListingCategory })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional({ description: 'Base price in naira (before option deltas)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10000000)
  price?: number;

  @ApiPropertyOptional({
    description:
      'Base stock (goods only). Explicit null = stop tracking (forces manual confirmation).',
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  stock?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  manualConfirm?: boolean;

  @ApiPropertyOptional({
    description:
      'Opt this listing out of (true) or back into (false) your vendor-level delivery preset',
  })
  @IsOptional()
  @IsBoolean()
  pickupOnly?: boolean;

  @ApiPropertyOptional({
    description: 'active | paused',
    enum: [ListingStatus.ACTIVE, ListingStatus.PAUSED],
  })
  @IsOptional()
  @IsIn([ListingStatus.ACTIVE, ListingStatus.PAUSED])
  status?: ListingStatus;

  @ApiPropertyOptional({
    description: 'Image URLs to APPEND (max 5 total)',
    type: [String],
    maxItems: 5,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  imageUrls?: string[];
}

export class ReplaceOptionGroupsDto {
  @ApiProperty({
    description: 'Full replacement set (empty array clears all groups)',
    type: [VendorOptionGroupInputDto],
    maxItems: 10,
  })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => VendorOptionGroupInputDto)
  groups: VendorOptionGroupInputDto[];
}

export class AdjustStockDto {
  @ApiProperty({
    description: 'New stock figure; null = stop tracking (forces manual confirmation)',
    example: 15,
    nullable: true,
  })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(0)
  stock: number | null;
}
