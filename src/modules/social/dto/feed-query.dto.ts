import { IsOptional, IsEnum, IsBoolean, IsNumber, IsString, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PostVisibility } from '../../../database/entities/post.entity';

export enum FeedSortOrder {
  RECENT = 'recent',
  TRENDING = 'trending',
}

export enum FeedFilterType {
  POLLS = 'polls',
}

export enum FeedTimePeriod {
  DAY = '24h',
  WEEK = '7d',
  MONTH = '30d',
}

export class FeedQueryDto {
  @ApiPropertyOptional({
    description: 'Pagination cursor (createdAt timestamp for recent, engagementScore for trending)',
    example: '2024-01-20T10:30:00.000Z',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of posts to return',
    example: 20,
    default: 20,
    minimum: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : 20))
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort order for posts',
    enum: FeedSortOrder,
    default: FeedSortOrder.RECENT,
    example: 'recent',
  })
  @IsEnum(FeedSortOrder)
  @IsOptional()
  sort?: FeedSortOrder;

  @ApiPropertyOptional({
    description: 'Filter posts by type',
    enum: FeedFilterType,
    example: 'polls',
  })
  @IsEnum(FeedFilterType)
  @IsOptional()
  filter?: FeedFilterType;

  @ApiPropertyOptional({
    description:
      'Filter by post visibility scope. Shows only posts matching this visibility level.',
    enum: PostVisibility,
    example: 'university',
  })
  @IsEnum(PostVisibility)
  @IsOptional()
  visibility?: PostVisibility;

  @ApiPropertyOptional({
    description: 'Filter to show only posts with images',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  hasImages?: boolean;

  @ApiPropertyOptional({
    description: 'Filter posts by time period (24h = last 24 hours, 7d = last 7 days, 30d = last 30 days)',
    enum: FeedTimePeriod,
    example: '24h',
  })
  @IsEnum(FeedTimePeriod)
  @IsOptional()
  since?: FeedTimePeriod;
}
