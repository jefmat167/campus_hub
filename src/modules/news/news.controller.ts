import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { AdminPermissions } from '../../common/constants/permissions';
import { ArticleCategory } from '../../database/entities/article.entity';
import { NewsService } from './news.service';
import { CreateArticleDto, UpdateArticleDto, ArticleQueryDto } from './dto';

@ApiTags('News & Articles')
@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  // ============ PUBLIC ENDPOINTS ============

  /**
   * Get published articles
   */
  @Get()
  @ApiOperation({ summary: 'Get published articles', description: 'Retrieve a paginated list of published articles with optional search, category, tag, and featured filters.' })
  @ApiResponse({
    status: 200,
    description: 'Articles retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: '10 Tips for Finding Affordable Housing Near Campus',
            slug: '10-tips-finding-affordable-housing-near-campus',
            excerpt: 'Finding affordable student housing can be challenging...',
            coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
            category: 'housing',
            tags: ['housing', 'tips', 'budget'],
            isFeatured: false,
            viewCount: 234,
            bookmarkCount: 18,
            readingTime: 5,
            publishedAt: '2026-03-18T10:00:00.000Z',
          },
        ],
        meta: { total: 42, page: 1, limit: 20, totalPages: 3, hasNextPage: true, hasPrevPage: false },
      },
    },
  })
  async getArticles(@Query() query: ArticleQueryDto) {
    const result = await this.newsService.getArticles(query);

    return {
      success: true,
      data: result.articles,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPrevPage: result.hasPrevPage,
      },
    };
  }

  /**
   * Get featured articles
   */
  @Get('featured')
  @ApiOperation({ summary: 'Get featured articles', description: 'Retrieve a list of featured published articles, ordered by most recent.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Maximum number of featured articles to return (default: 5)', example: 5 })
  @ApiResponse({
    status: 200,
    description: 'Featured articles retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: '10 Tips for Finding Affordable Housing Near Campus',
            slug: '10-tips-finding-affordable-housing-near-campus',
            excerpt: 'Finding affordable student housing can be challenging...',
            coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
            category: 'housing',
            tags: ['housing', 'tips', 'budget'],
            isFeatured: true,
            viewCount: 234,
            bookmarkCount: 18,
            readingTime: 5,
            publishedAt: '2026-03-18T10:00:00.000Z',
          },
        ],
      },
    },
  })
  async getFeaturedArticles(@Query('limit') limit?: string) {
    const articles = await this.newsService.getFeaturedArticles(
      Number(limit) || 5,
    );

    return {
      success: true,
      data: articles,
    };
  }

  /**
   * Get article categories
   */
  @Get('categories')
  @ApiOperation({ summary: 'Get article categories', description: 'Retrieve all available article categories.' })
  @ApiResponse({
    status: 200,
    description: 'Categories retrieved successfully',
    schema: {
      example: {
        success: true,
        data: ['news', 'tips', 'announcements', 'campus_life', 'safety', 'events', 'marketplace_tips', 'housing', 'general'],
      },
    },
  })
  getCategories() {
    return {
      success: true,
      data: Object.values(ArticleCategory),
    };
  }

  /**
   * Get articles by category
   */
  @Get('category/:category')
  @ApiOperation({ summary: 'Get articles by category', description: 'Retrieve a paginated list of published articles filtered by category.' })
  @ApiParam({ name: 'category', description: 'Article category to filter by', example: 'housing', enum: ['news', 'tips', 'announcements', 'campus_life', 'safety', 'events', 'marketplace_tips', 'housing', 'general'] })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Articles by category retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: '10 Tips for Finding Affordable Housing Near Campus',
            slug: '10-tips-finding-affordable-housing-near-campus',
            excerpt: 'Finding affordable student housing can be challenging...',
            coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
            category: 'housing',
            tags: ['housing', 'tips', 'budget'],
            isFeatured: false,
            viewCount: 234,
            bookmarkCount: 18,
            readingTime: 5,
            publishedAt: '2026-03-18T10:00:00.000Z',
          },
        ],
        meta: { total: 42, page: 1, limit: 20, totalPages: 3, hasNextPage: true, hasPrevPage: false },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid category' })
  async getArticlesByCategory(
    @Param('category') category: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.newsService.getArticlesByCategory(
      category,
      Number(page) || 1,
      Number(limit) || 20,
    );

    return {
      success: true,
      data: result.articles,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * Get article by slug (public)
   */
  @Get('slug/:slug')
  @ApiOperation({ summary: 'Get article by slug', description: 'Retrieve a full article by its URL-friendly slug. Increments the view count.' })
  @ApiParam({ name: 'slug', description: 'URL-friendly article slug', example: '10-tips-finding-affordable-housing-near-campus' })
  @ApiResponse({
    status: 200,
    description: 'Article retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: '10 Tips for Finding Affordable Housing Near Campus',
          slug: '10-tips-finding-affordable-housing-near-campus',
          excerpt: 'Finding affordable student housing can be challenging...',
          content: 'Full article content here...',
          coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
          category: 'housing',
          tags: ['housing', 'tips', 'budget'],
          isFeatured: false,
          viewCount: 235,
          bookmarkCount: 18,
          readingTime: 5,
          metaDescription: 'Discover 10 essential tips for finding affordable student housing.',
          publishedAt: '2026-03-18T10:00:00.000Z',
          author: { id: '...', fullName: 'Admin User' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticleBySlug(@Param('slug') slug: string) {
    const article = await this.newsService.getArticleBySlug(slug);

    return {
      success: true,
      data: article,
    };
  }

  /**
   * Get article by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get article by ID', description: 'Retrieve a full article by its UUID.' })
  @ApiParam({ name: 'id', description: 'Article UUID', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Article retrieved successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: '10 Tips for Finding Affordable Housing Near Campus',
          slug: '10-tips-finding-affordable-housing-near-campus',
          excerpt: 'Finding affordable student housing can be challenging...',
          content: 'Full article content here...',
          coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
          category: 'housing',
          tags: ['housing', 'tips', 'budget'],
          isFeatured: false,
          viewCount: 235,
          bookmarkCount: 18,
          readingTime: 5,
          metaDescription: 'Discover 10 essential tips for finding affordable student housing.',
          publishedAt: '2026-03-18T10:00:00.000Z',
          author: { id: '...', fullName: 'Admin User' },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async getArticleById(@Param('id', ParseUUIDPipe) id: string) {
    const article = await this.newsService.getArticleById(id);

    return {
      success: true,
      data: article,
    };
  }

  // ============ AUTHENTICATED USER ENDPOINTS ============

  /**
   * Get articles with bookmark status (authenticated)
   */
  @Get('feed/personalized')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get personalized article feed', description: 'Retrieve published articles with bookmark status for the authenticated user. Requires TIER_0 verification.' })
  @ApiResponse({
    status: 200,
    description: 'Personalized feed retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: '10 Tips for Finding Affordable Housing Near Campus',
            slug: '10-tips-finding-affordable-housing-near-campus',
            excerpt: 'Finding affordable student housing can be challenging...',
            coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
            category: 'housing',
            tags: ['housing', 'tips', 'budget'],
            isFeatured: false,
            viewCount: 234,
            bookmarkCount: 18,
            readingTime: 5,
            publishedAt: '2026-03-18T10:00:00.000Z',
            isBookmarked: true,
          },
        ],
        meta: { total: 42, page: 1, limit: 20, totalPages: 3, hasNextPage: true, hasPrevPage: false },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient verification tier' })
  async getPersonalizedFeed(
    @CurrentUser() user: User,
    @Query() query: ArticleQueryDto,
  ) {
    const result = await this.newsService.getArticles(query, user.id);

    return {
      success: true,
      data: result.articles,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * Bookmark an article
   */
  @Post(':id/bookmark')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Bookmark an article', description: 'Add an article to the authenticated user\'s bookmarks. This operation is idempotent. Requires TIER_0 verification.' })
  @ApiParam({ name: 'id', description: 'Article UUID to bookmark', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Article bookmarked successfully',
    schema: {
      example: {
        success: true,
        message: 'Article bookmarked',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient verification tier' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async bookmarkArticle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.newsService.bookmarkArticle(user.id, id);

    return {
      success: true,
      message: 'Article bookmarked',
    };
  }

  /**
   * Remove bookmark
   */
  @Delete(':id/bookmark')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove article bookmark', description: 'Remove an article from the authenticated user\'s bookmarks. Requires TIER_0 verification.' })
  @ApiParam({ name: 'id', description: 'Article UUID to unbookmark', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Bookmark removed successfully',
    schema: {
      example: {
        success: true,
        message: 'Bookmark removed',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient verification tier' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async removeBookmark(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.newsService.removeBookmark(user.id, id);

    return {
      success: true,
      message: 'Bookmark removed',
    };
  }

  /**
   * Get user's bookmarked articles
   */
  @Get('user/bookmarks')
  @UseGuards(JwtAuthGuard, TierGuard)
  @MinTier(VerificationTier.TIER_0)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user bookmarks', description: 'Retrieve the authenticated user\'s bookmarked articles with pagination. Requires TIER_0 verification.' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 20)', example: 20 })
  @ApiResponse({
    status: 200,
    description: 'User bookmarks retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: '10 Tips for Finding Affordable Housing Near Campus',
            slug: '10-tips-finding-affordable-housing-near-campus',
            excerpt: 'Finding affordable student housing can be challenging...',
            coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
            category: 'housing',
            tags: ['housing', 'tips', 'budget'],
            isFeatured: false,
            viewCount: 234,
            bookmarkCount: 18,
            readingTime: 5,
            publishedAt: '2026-03-18T10:00:00.000Z',
          },
        ],
        meta: { total: 5, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Insufficient verification tier' })
  async getUserBookmarks(
    @CurrentUser() user: User,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.newsService.getUserBookmarks(
      user.id,
      Number(page) || 1,
      Number(limit) || 20,
    );

    return {
      success: true,
      data: result.articles,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  // ============ ADMIN ENDPOINTS ============

  /**
   * Create article (admin)
   */
  @Post('admin/articles')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.NEWS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create article', description: 'Create a new article. Slug, reading time, and excerpt are auto-generated if not provided. Requires ADMIN or SUPER_ADMIN role.' })
  @ApiResponse({
    status: 201,
    description: 'Article created successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: '10 Tips for Finding Affordable Housing Near Campus',
          slug: '10-tips-finding-affordable-housing-near-campus',
          excerpt: 'Finding affordable student housing can be challenging...',
          content: 'Full article content here...',
          coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
          category: 'housing',
          tags: ['housing', 'tips', 'budget'],
          status: 'draft',
          isFeatured: false,
          viewCount: 0,
          bookmarkCount: 0,
          readingTime: 5,
          metaDescription: 'Discover 10 essential tips for finding affordable student housing.',
          publishedAt: null,
          author: { id: '...', fullName: 'Admin User' },
        },
        message: 'Article created successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async createArticle(
    @CurrentUser() user: User,
    @Body() dto: CreateArticleDto,
  ) {
    const article = await this.newsService.createArticle(user.id, dto);

    return {
      success: true,
      data: article,
      message: 'Article created successfully',
    };
  }

  /**
   * Update article (admin)
   */
  @Patch('admin/articles/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.NEWS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update article', description: 'Update an existing article by ID. Requires ADMIN or SUPER_ADMIN role.' })
  @ApiParam({ name: 'id', description: 'Article UUID to update', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Article updated successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: '10 Tips for Finding Affordable Housing Near Campus',
          slug: '10-tips-finding-affordable-housing-near-campus',
          excerpt: 'Finding affordable student housing can be challenging...',
          content: 'Updated article content here...',
          coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
          category: 'housing',
          tags: ['housing', 'tips', 'budget'],
          isFeatured: false,
          viewCount: 235,
          bookmarkCount: 18,
          readingTime: 5,
          metaDescription: 'Discover 10 essential tips for finding affordable student housing.',
          publishedAt: '2026-03-18T10:00:00.000Z',
          author: { id: '...', fullName: 'Admin User' },
        },
        message: 'Article updated successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async updateArticle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateArticleDto,
  ) {
    const article = await this.newsService.updateArticle(id, user.id, dto, true);

    return {
      success: true,
      data: article,
      message: 'Article updated successfully',
    };
  }

  /**
   * Delete article (admin)
   */
  @Delete('admin/articles/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.NEWS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete article', description: 'Soft-delete (archive) an article by ID. Requires ADMIN or SUPER_ADMIN role.' })
  @ApiParam({ name: 'id', description: 'Article UUID to delete', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Article deleted successfully',
    schema: {
      example: {
        success: true,
        message: 'Article deleted successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async deleteArticle(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.newsService.deleteArticle(id, user.id, true);

    return {
      success: true,
      message: 'Article deleted successfully',
    };
  }

  /**
   * Get all articles including drafts (admin)
   */
  @Get('admin/articles')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.NEWS_READ)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all articles (admin)', description: 'Retrieve all articles including drafts and archived. Requires ADMIN or SUPER_ADMIN role.' })
  @ApiResponse({
    status: 200,
    description: 'Admin articles retrieved successfully',
    schema: {
      example: {
        success: true,
        data: [
          {
            id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
            title: '10 Tips for Finding Affordable Housing Near Campus',
            slug: '10-tips-finding-affordable-housing-near-campus',
            excerpt: 'Finding affordable student housing can be challenging...',
            coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
            category: 'housing',
            tags: ['housing', 'tips', 'budget'],
            status: 'draft',
            isFeatured: false,
            viewCount: 234,
            bookmarkCount: 18,
            readingTime: 5,
            publishedAt: null,
          },
        ],
        meta: { total: 50, page: 1, limit: 20, totalPages: 3 },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  async getAdminArticles(@Query() query: ArticleQueryDto) {
    const result = await this.newsService.getArticles(query, undefined, true);

    return {
      success: true,
      data: result.articles,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  /**
   * Publish article (admin)
   */
  @Post('admin/articles/:id/publish')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.NEWS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish article', description: 'Publish a draft article, setting its status to published and recording the publish date. Requires ADMIN or SUPER_ADMIN role.' })
  @ApiParam({ name: 'id', description: 'Article UUID to publish', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Article published successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: '10 Tips for Finding Affordable Housing Near Campus',
          slug: '10-tips-finding-affordable-housing-near-campus',
          excerpt: 'Finding affordable student housing can be challenging...',
          content: 'Full article content here...',
          coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
          category: 'housing',
          tags: ['housing', 'tips', 'budget'],
          status: 'published',
          isFeatured: false,
          viewCount: 0,
          bookmarkCount: 0,
          readingTime: 5,
          publishedAt: '2026-03-19T12:00:00.000Z',
          author: { id: '...', fullName: 'Admin User' },
        },
        message: 'Article published successfully',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async publishArticle(@Param('id', ParseUUIDPipe) id: string) {
    const article = await this.newsService.publishArticle(id);

    return {
      success: true,
      data: article,
      message: 'Article published successfully',
    };
  }

  /**
   * Unpublish article (admin)
   */
  @Post('admin/articles/:id/unpublish')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.NEWS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unpublish article', description: 'Revert a published article back to draft status. Requires ADMIN or SUPER_ADMIN role.' })
  @ApiParam({ name: 'id', description: 'Article UUID to unpublish', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Article unpublished successfully',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: '10 Tips for Finding Affordable Housing Near Campus',
          slug: '10-tips-finding-affordable-housing-near-campus',
          excerpt: 'Finding affordable student housing can be challenging...',
          content: 'Full article content here...',
          coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
          category: 'housing',
          tags: ['housing', 'tips', 'budget'],
          status: 'draft',
          isFeatured: false,
          viewCount: 235,
          bookmarkCount: 18,
          readingTime: 5,
          publishedAt: '2026-03-18T10:00:00.000Z',
          author: { id: '...', fullName: 'Admin User' },
        },
        message: 'Article unpublished',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async unpublishArticle(@Param('id', ParseUUIDPipe) id: string) {
    const article = await this.newsService.unpublishArticle(id);

    return {
      success: true,
      data: article,
      message: 'Article unpublished',
    };
  }

  /**
   * Set article as featured (admin)
   */
  @Patch('admin/articles/:id/featured')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission(AdminPermissions.NEWS_MANAGE)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set article featured status', description: 'Toggle the featured flag on an article. Requires ADMIN or SUPER_ADMIN role.' })
  @ApiParam({ name: 'id', description: 'Article UUID to update', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  @ApiResponse({
    status: 200,
    description: 'Article featured status updated',
    schema: {
      example: {
        success: true,
        data: {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          title: '10 Tips for Finding Affordable Housing Near Campus',
          slug: '10-tips-finding-affordable-housing-near-campus',
          excerpt: 'Finding affordable student housing can be challenging...',
          content: 'Full article content here...',
          coverImageUrl: 'https://storage.example.com/articles/housing-tips.jpg',
          category: 'housing',
          tags: ['housing', 'tips', 'budget'],
          status: 'published',
          isFeatured: true,
          viewCount: 235,
          bookmarkCount: 18,
          readingTime: 5,
          publishedAt: '2026-03-18T10:00:00.000Z',
          author: { id: '...', fullName: 'Admin User' },
        },
        message: 'Article marked as featured',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Admin role required' })
  @ApiResponse({ status: 404, description: 'Article not found' })
  async setFeatured(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('isFeatured') isFeatured: boolean,
  ) {
    const article = await this.newsService.setFeatured(id, isFeatured);

    return {
      success: true,
      data: article,
      message: isFeatured ? 'Article marked as featured' : 'Article removed from featured',
    };
  }
}
