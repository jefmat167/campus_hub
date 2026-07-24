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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArticleCategory, ArticleStatus } from '../../../database/entities/article.entity';

export class CreateArticleDto {
  @ApiProperty({
    description: 'Article title (5-255 characters)',
    example: '10 Tips for Finding Affordable Housing Near Campus',
    minLength: 5,
    maxLength: 255,
  })
  @IsString()
  @MinLength(5)
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({
    description: 'Short summary/excerpt of the article',
    example: 'Finding affordable student housing can be challenging. Here are our top tips for securing a great place without breaking the bank.',
    maxLength: 300,
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  excerpt?: string;

  @ApiProperty({
    description: 'Full article content (minimum 50 characters)',
    example: 'Finding the perfect student accommodation is one of the biggest challenges...',
    minLength: 50,
  })
  @IsString()
  @MinLength(50)
  content: string;

  @ApiPropertyOptional({
    description: 'URL to the cover/featured image',
    example: 'https://storage.example.com/articles/housing-tips-cover.jpg',
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

  @ApiProperty({
    description: 'Article category',
    enum: ArticleCategory,
    example: ArticleCategory.HOUSING,
  })
  @IsEnum(ArticleCategory)
  category: ArticleCategory;

  @ApiPropertyOptional({
    description: 'Article tags for searchability',
    example: ['housing', 'tips', 'budget', 'students'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({
    description: 'Publication status',
    enum: ArticleStatus,
    example: ArticleStatus.DRAFT,
    default: ArticleStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(ArticleStatus)
  status?: ArticleStatus;

  @ApiPropertyOptional({
    description: 'Whether to feature this article prominently',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({
    description: 'SEO meta description (max 160 characters)',
    example: 'Discover 10 essential tips for finding affordable student housing near your campus.',
    maxLength: 160,
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaDescription?: string;

  @ApiPropertyOptional({
    description: 'SEO meta keywords',
    example: ['student housing', 'affordable accommodation', 'campus living'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  metaKeywords?: string[];

  @ApiPropertyOptional({
    description: 'University IDs this article is scoped to. If empty or not provided, the article is visible to all universities.',
    example: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  universityIds?: string[];
}
