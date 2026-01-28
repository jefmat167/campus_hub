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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TierGuard } from '../../common/guards/tier.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MinTier } from '../../common/decorators/min-tier.decorator';
import { User, UserRole, VerificationTier } from '../../database/entities/user.entity';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
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
