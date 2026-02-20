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
  VisibilityScope,
} from '../../../database/entities/listing.entity';
import {
  RequestUrgency,
  BuyRequestStatus,
} from '../../../database/entities/buy-request.entity';

export enum BuyRequestSortBy {
  CREATED_AT = 'createdAt',
  BUDGET_ASC = 'budget_asc',
  BUDGET_DESC = 'budget_desc',
  URGENCY = 'urgency',
  VIEWS = 'views',
}

export class BuyRequestQueryDto {
  @ApiPropertyOptional({
    description: 'Search term for title and description',
    example: 'MacBook',
  })
  @IsString()
  @IsOptional()
  @Transform(({ value }) => value?.trim())
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by single category',
    enum: ListingCategory,
    example: ListingCategory.LAPTOPS,
  })
  @IsEnum(ListingCategory)
  @IsOptional()
  category?: ListingCategory;

  @ApiPropertyOptional({
    description: 'Filter by multiple categories',
    enum: ListingCategory,
    isArray: true,
    example: [ListingCategory.LAPTOPS, ListingCategory.PHONES],
  })
  @IsArray()
  @IsEnum(ListingCategory, { each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  categories?: ListingCategory[];

  @ApiPropertyOptional({
    description: 'Filter by urgency',
    enum: RequestUrgency,
    example: RequestUrgency.ASAP,
  })
  @IsEnum(RequestUrgency)
  @IsOptional()
  urgency?: RequestUrgency;

  @ApiPropertyOptional({
    description: 'Filter by multiple urgency levels',
    enum: RequestUrgency,
    isArray: true,
    example: [RequestUrgency.ASAP, RequestUrgency.WITHIN_A_WEEK],
  })
  @IsArray()
  @IsEnum(RequestUrgency, { each: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? [value] : value))
  urgencies?: RequestUrgency[];

  @ApiPropertyOptional({
    description: 'Minimum budget in Naira',
    example: 50000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Type(() => Number)
  minBudget?: number;

  @ApiPropertyOptional({
    description: 'Maximum budget in Naira',
    example: 500000,
    maximum: 10000000,
  })
  @IsNumber()
  @Max(10000000)
  @IsOptional()
  @Type(() => Number)
  maxBudget?: number;

  @ApiPropertyOptional({
    description: 'Only show requests with negotiable budget',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isBudgetNegotiable?: boolean;

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
    description: 'Filter by requester ID',
    example: '550e8400-e29b-41d4-a716-446655440003',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  requesterId?: string;

  @ApiPropertyOptional({
    description: 'Filter by request status',
    enum: BuyRequestStatus,
    example: BuyRequestStatus.OPEN,
  })
  @IsEnum(BuyRequestStatus)
  @IsOptional()
  status?: BuyRequestStatus;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: BuyRequestSortBy,
    default: BuyRequestSortBy.CREATED_AT,
    example: BuyRequestSortBy.URGENCY,
  })
  @IsEnum(BuyRequestSortBy)
  @IsOptional()
  sortBy?: BuyRequestSortBy = BuyRequestSortBy.CREATED_AT;

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

export class PaginatedBuyRequestsResponseDto {
  @ApiProperty({ description: 'Array of buy requests' })
  requests: any[];

  @ApiProperty({ description: 'Total number of requests', example: 50 })
  total: number;

  @ApiProperty({ description: 'Current page', example: 1 })
  page: number;

  @ApiProperty({ description: 'Items per page', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total number of pages', example: 3 })
  totalPages: number;

  @ApiProperty({ description: 'Whether there is a next page', example: true })
  hasNextPage: boolean;

  @ApiProperty({ description: 'Whether there is a previous page', example: false })
  hasPrevPage: boolean;
}
