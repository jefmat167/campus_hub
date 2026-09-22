import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsUUID,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ListingCategory,
  ListingCondition,
  VisibilityScope,
  ListingStatus,
  ListingKind,
} from '../../../database/entities/listing.entity';

export enum ListingSortBy {
  CREATED_AT = 'createdAt',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  VIEWS = 'views',
  RELEVANCE = 'relevance',
}

export class ListingQueryDto {
  @ApiPropertyOptional({
    description: 'Search term for title and description',
    example: 'iPhone',
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by single category',
    enum: ListingCategory,
    example: ListingCategory.ELECTRONICS,
  })
  @IsEnum(ListingCategory)
  @IsOptional()
  category?: ListingCategory;

  @ApiPropertyOptional({
    description: 'Filter by multiple categories',
    enum: ListingCategory,
    isArray: true,
    example: [ListingCategory.ELECTRONICS, ListingCategory.BOOKS],
  })
  @IsArray()
  @IsEnum(ListingCategory, { each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  categories?: ListingCategory[];

  @ApiPropertyOptional({
    description: 'Filter by single condition',
    enum: ListingCondition,
    example: ListingCondition.LIKE_NEW,
  })
  @IsEnum(ListingCondition)
  @IsOptional()
  condition?: ListingCondition;

  @ApiPropertyOptional({
    description: 'Filter by multiple conditions',
    enum: ListingCondition,
    isArray: true,
    example: [ListingCondition.NEW, ListingCondition.LIKE_NEW],
  })
  @IsArray()
  @IsEnum(ListingCondition, { each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  conditions?: ListingCondition[];

  @ApiPropertyOptional({
    description:
      'Restrict the unified feed to listing kinds (student items, shop goods, bookable services). Default: all.',
    enum: ListingKind,
    isArray: true,
    example: [ListingKind.P2P, ListingKind.VENDOR_GOODS],
  })
  @IsArray()
  @IsEnum(ListingKind, { each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  kinds?: ListingKind[];

  @ApiPropertyOptional({
    description: 'Minimum price in Naira',
    example: 5000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Maximum price in Naira',
    example: 500000,
    maximum: 10000000,
  })
  @IsNumber()
  @Max(10000000)
  @IsOptional()
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({
    description: 'Only show negotiable listings',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isNegotiable?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by visibility scope',
    enum: VisibilityScope,
    example: VisibilityScope.UNIVERSITY,
  })
  @IsEnum(VisibilityScope)
  @IsOptional()
  visibilityScope?: VisibilityScope;

  @ApiPropertyOptional({
    description: 'Filter by university ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  universityId?: string;

  @ApiPropertyOptional({
    description: 'Filter by faculty ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

  @ApiPropertyOptional({
    description: 'Filter by department ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  departmentId?: string;

  @ApiPropertyOptional({
    description: 'Filter by seller ID',
    example: '550e8400-e29b-41d4-a716-446655440003',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  sellerId?: string;

  @ApiPropertyOptional({
    description: 'Only show listings from ID-verified sellers',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  verifiedSellersOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by listing status',
    enum: ListingStatus,
    example: ListingStatus.ACTIVE,
  })
  @IsEnum(ListingStatus)
  @IsOptional()
  status?: ListingStatus;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ListingSortBy,
    default: ListingSortBy.CREATED_AT,
    example: ListingSortBy.PRICE_ASC,
  })
  @IsEnum(ListingSortBy)
  @IsOptional()
  sortBy?: ListingSortBy = ListingSortBy.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Number of results per page',
    default: 20,
    minimum: 1,
    maximum: 100,
    example: 20,
  })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Page number',
    default: 1,
    minimum: 1,
    example: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;
}

export class PaginatedListingsResponseDto {
  @ApiProperty({ description: 'Array of listings' })
  listings: any[];

  @ApiProperty({ description: 'Total number of listings', example: 150 })
  total: number;

  @ApiProperty({ description: 'Current page', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 8 })
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether there is a previous page', example: false })
  hasPrevPage: boolean;
}
