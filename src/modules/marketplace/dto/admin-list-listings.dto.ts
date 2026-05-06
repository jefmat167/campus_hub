import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsNumberString,
  IsString,
  IsIn,
} from 'class-validator';
import { ListingStatus, ListingCategory } from '../../../database/entities/listing.entity';

export class AdminListListingsDto {
  @ApiPropertyOptional({ description: 'Search title/description' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ListingStatus })
  @IsOptional()
  @IsEnum(ListingStatus)
  status?: ListingStatus;

  @ApiPropertyOptional({ enum: ListingCategory })
  @IsOptional()
  @IsEnum(ListingCategory)
  category?: ListingCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  minPrice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  maxPrice?: string;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
