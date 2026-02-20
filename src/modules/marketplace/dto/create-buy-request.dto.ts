import {
  IsString,
  IsNotEmpty,
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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ListingCategory,
  VisibilityScope,
} from '../../../database/entities/listing.entity';
import { RequestUrgency } from '../../../database/entities/buy-request.entity';

export class CreateBuyRequestDto {
  @ApiProperty({
    description: 'Title of the buy request',
    example: 'Looking for a used MacBook Pro',
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
    description: 'Detailed description of what you are looking for',
    example:
      'I need a MacBook Pro 2020 or newer, preferably M1 chip. Must be in good working condition with at least 8GB RAM and 256GB SSD.',
    minLength: 20,
    maxLength: 2000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(20)
  @MaxLength(2000)
  @Transform(({ value }) => value?.trim())
  description: string;

  @ApiProperty({
    description: 'Category of item wanted',
    enum: ListingCategory,
    example: ListingCategory.LAPTOPS,
  })
  @IsEnum(ListingCategory)
  category: ListingCategory;

  @ApiProperty({
    description: 'Minimum budget in Naira (₦)',
    example: 400000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100)
  @Max(10000000)
  budgetMin: number;

  @ApiPropertyOptional({
    description:
      'Maximum budget in Naira (₦). If not provided, budgetMin is treated as fixed budget.',
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
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isBudgetNegotiable?: boolean = true;

  @ApiPropertyOptional({
    description: 'How urgently you need the item',
    enum: RequestUrgency,
    default: RequestUrgency.FLEXIBLE,
    example: RequestUrgency.WITHIN_A_WEEK,
  })
  @IsEnum(RequestUrgency)
  @IsOptional()
  urgency?: RequestUrgency = RequestUrgency.FLEXIBLE;

  @ApiPropertyOptional({
    description: 'Who can see this request',
    enum: VisibilityScope,
    default: VisibilityScope.UNIVERSITY,
    example: VisibilityScope.UNIVERSITY,
  })
  @IsEnum(VisibilityScope)
  @IsOptional()
  visibilityScope?: VisibilityScope = VisibilityScope.UNIVERSITY;

  @ApiPropertyOptional({
    description: 'Restrict to specific faculty (required if visibility is FACULTY)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  facultyId?: string;

  @ApiPropertyOptional({
    description: 'Restrict to specific department (required if visibility is DEPARTMENT)',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  departmentId?: string;
}
