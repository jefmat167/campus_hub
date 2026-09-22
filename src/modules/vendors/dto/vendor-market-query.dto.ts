import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ListingCategory } from '../../../database/entities/listing.entity';

export class BrowseVendorsDto {
  @ApiPropertyOptional({
    description: 'Only vendors with an active listing in this category',
    enum: ListingCategory,
  })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional({ description: 'Storefront name search' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: string;
}

export class SearchVendorListingsDto {
  @ApiPropertyOptional({ description: 'Item-level text search (title + description)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: ListingCategory })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  page?: string;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  limit?: string;
}
