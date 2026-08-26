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
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ListingCategory } from '../../../database/entities/listing.entity';
import {
  VendorListingStatus,
  VendorListingType,
} from '../../../database/entities/vendor-listing.entity';
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

export class VendorFulfillmentInputDto {
  @ApiProperty({
    description: 'A university this vendor serves',
    format: 'uuid',
  })
  @IsUUID()
  universityId: string;

  @ApiProperty({
    description: 'Whether this listing delivers to that university',
    example: true,
  })
  @IsBoolean()
  deliveryEnabled: boolean;

  @ApiPropertyOptional({
    description:
      'Delivery/travel fee to that university in naira (0 = free). Ignored when delivery is disabled.',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  deliveryFee?: number;
}

export class CreateVendorListingDto {
  @ApiProperty({ enum: VendorListingType, example: VendorListingType.GOODS })
  @IsEnum(VendorListingType)
  type: VendorListingType;

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

  @ApiProperty({ description: 'Base price in naira', example: 3500 })
  @IsNumber()
  @IsPositive()
  @Max(10000000)
  basePrice: number;

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
    description: 'Per-university delivery opt-in (⊆ served universities)',
    type: [VendorFulfillmentInputDto],
    maxItems: 3,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VendorFulfillmentInputDto)
  fulfillment?: VendorFulfillmentInputDto[];
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

  @ApiPropertyOptional({ description: 'Base price in naira' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(10000000)
  basePrice?: number;

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
    description: 'active | paused',
    enum: [VendorListingStatus.ACTIVE, VendorListingStatus.PAUSED],
  })
  @IsOptional()
  @IsIn([VendorListingStatus.ACTIVE, VendorListingStatus.PAUSED])
  status?: VendorListingStatus;

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

export class ReplaceFulfillmentDto {
  @ApiProperty({
    description:
      'Full replacement set of per-university delivery config (⊆ served universities; empty = pickup only everywhere)',
    type: [VendorFulfillmentInputDto],
    maxItems: 3,
  })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VendorFulfillmentInputDto)
  universities: VendorFulfillmentInputDto[];
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
