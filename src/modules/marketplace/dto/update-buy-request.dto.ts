import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsUUID,
  Min,
  Max,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ListingCategory,
  VisibilityScope,
} from '../../../database/entities/listing.entity';
import { RequestUrgency } from '../../../database/entities/buy-request.entity';

export class UpdateBuyRequestDto {
  @ApiPropertyOptional({
    description: 'Title of the buy request',
    example: 'Looking for a used MacBook Pro',
    minLength: 5,
    maxLength: 255,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of what you are looking for',
    example:
      'I need a MacBook Pro 2020 or newer, preferably M1 chip. Must be in good working condition.',
    minLength: 20,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  @Transform(({ value }) => value?.trim())
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Category of item wanted',
    enum: ListingCategory,
    example: ListingCategory.LAPTOPS,
  })
  @IsEnum(ListingCategory)
  @IsOptional()
  category?: ListingCategory;

  @ApiPropertyOptional({
    description: 'Minimum budget in Naira (₦)',
    example: 400000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  @IsOptional()
  budgetMin?: number;

  @ApiPropertyOptional({
    description: 'Maximum budget in Naira (₦)',
    example: 500000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  @IsOptional()
  @ValidateIf((o) => o.budgetMax !== undefined)
  budgetMax?: number;

  @ApiPropertyOptional({
    description: 'Whether you are open to negotiating on budget',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isBudgetNegotiable?: boolean;

  @ApiPropertyOptional({
    description: 'How urgently you need the item',
    enum: RequestUrgency,
    example: RequestUrgency.WITHIN_A_WEEK,
  })
  @IsEnum(RequestUrgency)
  @IsOptional()
  urgency?: RequestUrgency;

  @ApiPropertyOptional({
    description: 'Who can see this request',
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
}
