import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  IsUrl,
  IsBoolean,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArticleCategory, ArticleStatus } from '../../../database/entities/article.entity';

export class UpdateArticleDto {
  @ApiPropertyOptional({
    description: 'Article title (5-255 characters)',
    example: 'Updated: 10 Tips for Finding Affordable Housing Near Campus',
    minLength: 5,
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({
    description: 'Short summary/excerpt of the article',
    example: 'Updated excerpt with the latest housing market information.',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  excerpt?: string;

  @ApiPropertyOptional({
    description: 'Full article content (minimum 50 characters)',
    example: 'Updated content with new tips and information...',
    minLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(50)
  content?: string;

  @ApiPropertyOptional({
    description: 'URL to the cover/featured image',
    example: 'https://storage.example.com/articles/housing-tips-cover-v2.jpg',
  })
  @IsOptional()
  @IsUrl()
  coverImageUrl?: string;

  @ApiPropertyOptional({
    description: 'Array of image URLs for the article body',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[];

  @ApiPropertyOptional({
    description: 'URL to the article video',
    example: 'https://storage.example.com/articles/campus-tour.mp4',
  })
  @IsOptional()
  @IsUrl()
  videoUrl?: string;

  @ApiPropertyOptional({
    description: 'Article category',
    enum: ArticleCategory,
    example: ArticleCategory.TIPS,
  })
  @IsOptional()
  @IsEnum(ArticleCategory)
  category?: ArticleCategory;

  @ApiPropertyOptional({
    description: 'Article tags for searchability',
    example: ['housing', 'tips', 'budget', 'students', '2024'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Publication status',
    enum: ArticleStatus,
    example: ArticleStatus.PUBLISHED,
  })
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiPropertyOptional({
    description: 'Whether to feature this article prominently',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'SEO meta description (max 160 characters)',
    example: 'Updated guide with 10 essential tips for finding affordable student housing.',
    maxLength: 160,
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaDescription?: string;

  @ApiPropertyOptional({
    description: 'SEO meta keywords',
    example: ['student housing', 'affordable accommodation', 'campus living', '2024'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metaKeywords?: string[];

  @ApiPropertyOptional({
    description: 'University IDs this article is scoped to. Empty array = visible to all.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  universityIds?: string[];
}
