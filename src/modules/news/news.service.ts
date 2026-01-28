import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { Article, ArticleStatus } from '../../database/entities/article.entity';
import { ArticleBookmark } from '../../database/entities/article-bookmark.entity';
import {
  CreateArticleDto,
  UpdateArticleDto,
  ArticleQueryDto,
  PaginatedArticlesResponseDto,
} from './dto';

@Injectable()
export class NewsService {
  constructor(
    @InjectRepository(Article)
    private readonly articleRepository: Repository<Article>,
    @InjectRepository(ArticleBookmark)
    private readonly bookmarkRepository: Repository<ArticleBookmark>,
  ) {}

  // ============ ARTICLE CRUD ============

  async createArticle(authorId: string, dto: CreateArticleDto): Promise<Article> {
    // Generate slug from title
    const slug = await this.generateUniqueSlug(dto.title);

    // Calculate reading time (average 200 words per minute)
    const wordCount = dto.content.split(/\s+/).length;
    const readingTime = Math.max(1, Math.ceil(wordCount / 200));

    // Generate excerpt if not provided
    const excerpt = dto.excerpt || this.generateExcerpt(dto.content);

    const article = this.articleRepository.create({
      ...dto,
      authorId,
      slug,
      excerpt,
      readingTime,
      publishedAt: dto.status === ArticleStatus.PUBLISHED ? new Date() : null,
    });

    return this.articleRepository.save(article);
  }

  async updateArticle(
    articleId: string,
    authorId: string,
    dto: UpdateArticleDto,
    isAdmin: boolean = false,
  ): Promise<Article> {
    const article = await this.articleRepository.findOne({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Only admin or author can update
    if (!isAdmin && article.authorId !== authorId) {
      throw new BadRequestException('You can only update your own articles');
    }

    // Update slug if title changed
    if (dto.title && dto.title !== article.title) {
      article.slug = await this.generateUniqueSlug(dto.title, articleId);
    }

    // Recalculate reading time if content changed
    if (dto.content) {
      const wordCount = dto.content.split(/\s+/).length;
      article.readingTime = Math.max(1, Math.ceil(wordCount / 200));
    }

    // Set published date if status changes to published
    if (dto.status === ArticleStatus.PUBLISHED && article.status !== ArticleStatus.PUBLISHED) {
      article.publishedAt = new Date();
    }

    // Apply updates
    Object.assign(article, dto);

    return this.articleRepository.save(article);
  }

  async deleteArticle(articleId: string, authorId: string, isAdmin: boolean = false): Promise<void> {
    const article = await this.articleRepository.findOne({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    if (!isAdmin && article.authorId !== authorId) {
      throw new BadRequestException('You can only delete your own articles');
    }

    // Soft delete by archiving
    article.status = ArticleStatus.ARCHIVED;
    await this.articleRepository.save(article);
  }

  async getArticleById(articleId: string, userId?: string): Promise<Article & { isBookmarked?: boolean }> {
    const article = await this.articleRepository.findOne({
      where: { id: articleId },
      relations: ['author'],
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Check if bookmarked by user
    if (userId) {
      const bookmark = await this.bookmarkRepository.findOne({
        where: { userId, articleId },
      });
      (article as any).isBookmarked = !!bookmark;
    }

    return article;
  }

  async getArticleBySlug(slug: string, userId?: string): Promise<Article & { isBookmarked?: boolean }> {
    const article = await this.articleRepository.findOne({
      where: { slug, status: ArticleStatus.PUBLISHED },
      relations: ['author'],
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    // Increment view count
    await this.articleRepository.increment({ id: article.id }, 'viewCount', 1);
    article.viewCount += 1;

    // Check if bookmarked by user
    if (userId) {
      const bookmark = await this.bookmarkRepository.findOne({
        where: { userId, articleId: article.id },
      });
      (article as any).isBookmarked = !!bookmark;
    }

    return article;
  }

  async getArticles(
    query: ArticleQueryDto,
    userId?: string,
    includeUnpublished: boolean = false,
  ): Promise<PaginatedArticlesResponseDto> {
    const qb = this.articleRepository
      .createQueryBuilder('article')
      .leftJoinAndSelect('article.author', 'author');

    // Filter by status
    if (!includeUnpublished) {
      qb.andWhere('article.status = :status', { status: ArticleStatus.PUBLISHED });
    } else if (query.status) {
      qb.andWhere('article.status = :status', { status: query.status });
    }

    // Search
    if (query.search) {
      qb.andWhere(
        new Brackets((subQb) => {
          subQb
            .where('article.title ILIKE :search', { search: `%${query.search}%` })
            .orWhere('article.excerpt ILIKE :search', { search: `%${query.search}%` })
            .orWhere('article.content ILIKE :search', { search: `%${query.search}%` });
        }),
      );
    }

    // Filter by category
    if (query.category) {
      qb.andWhere('article.category = :category', { category: query.category });
    }

    // Filter by tag
    if (query.tag) {
      qb.andWhere('article.tags @> :tag', { tag: JSON.stringify([query.tag]) });
    }

    // Filter by featured
    if (query.featured !== undefined) {
      qb.andWhere('article.isFeatured = :featured', { featured: query.featured });
    }

    // Order by published date (most recent first)
    qb.orderBy('article.publishedAt', 'DESC', 'NULLS LAST')
      .addOrderBy('article.createdAt', 'DESC');

    // Get total count
    const total = await qb.getCount();

    // Apply pagination
    const limit = query.limit || 20;
    const page = query.page || 1;
    const offset = (page - 1) * limit;

    qb.skip(offset).take(limit);

    const articles = await qb.getMany();

    // Check bookmarks for user
    if (userId && articles.length > 0) {
      const articleIds = articles.map((a) => a.id);
      const bookmarks = await this.bookmarkRepository.find({
        where: articleIds.map((id) => ({ userId, articleId: id })),
      });
      const bookmarkedIds = new Set(bookmarks.map((b) => b.articleId));
      articles.forEach((article) => {
        (article as any).isBookmarked = bookmarkedIds.has(article.id);
      });
    }

    const totalPages = Math.ceil(total / limit);

    return {
      articles,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  async getFeaturedArticles(limit: number = 5): Promise<Article[]> {
    return this.articleRepository.find({
      where: {
        status: ArticleStatus.PUBLISHED,
        isFeatured: true,
      },
      relations: ['author'],
      order: { publishedAt: 'DESC' },
      take: limit,
    });
  }

  async getArticlesByCategory(
    category: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedArticlesResponseDto> {
    return this.getArticles({ category: category as any, page, limit });
  }

  // ============ BOOKMARKS ============

  async bookmarkArticle(userId: string, articleId: string): Promise<void> {
    const article = await this.articleRepository.findOne({
      where: { id: articleId, status: ArticleStatus.PUBLISHED },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const existingBookmark = await this.bookmarkRepository.findOne({
      where: { userId, articleId },
    });

    if (existingBookmark) {
      return; // Already bookmarked
    }

    await this.bookmarkRepository.save({ userId, articleId });

    // Increment bookmark count
    await this.articleRepository.increment({ id: articleId }, 'bookmarkCount', 1);
  }

  async removeBookmark(userId: string, articleId: string): Promise<void> {
    const result = await this.bookmarkRepository.delete({ userId, articleId });

    if (result.affected && result.affected > 0) {
      // Decrement bookmark count
      await this.articleRepository.decrement({ id: articleId }, 'bookmarkCount', 1);
    }
  }

  async getUserBookmarks(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<PaginatedArticlesResponseDto> {
    const offset = (page - 1) * limit;

    const [bookmarks, total] = await this.bookmarkRepository.findAndCount({
      where: { userId },
      relations: ['article', 'article.author'],
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    const articles = bookmarks
      .map((b) => {
        if (b.article) {
          (b.article as any).isBookmarked = true;
        }
        return b.article;
      })
      .filter((a) => a && a.status === ArticleStatus.PUBLISHED);

    const totalPages = Math.ceil(total / limit);

    return {
      articles,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };
  }

  // ============ ADMIN ============

  async publishArticle(articleId: string): Promise<Article> {
    const article = await this.articleRepository.findOne({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    if (article.status === ArticleStatus.PUBLISHED) {
      throw new BadRequestException('Article is already published');
    }

    article.status = ArticleStatus.PUBLISHED;
    article.publishedAt = new Date();

    return this.articleRepository.save(article);
  }

  async unpublishArticle(articleId: string): Promise<Article> {
    const article = await this.articleRepository.findOne({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    article.status = ArticleStatus.DRAFT;

    return this.articleRepository.save(article);
  }

  async setFeatured(articleId: string, isFeatured: boolean): Promise<Article> {
    const article = await this.articleRepository.findOne({
      where: { id: articleId },
    });

    if (!article) {
      throw new NotFoundException('Article not found');
    }

    article.isFeatured = isFeatured;

    return this.articleRepository.save(article);
  }

  // ============ HELPERS ============

  private async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    let slug = this.slugify(title);
    let counter = 0;
    let uniqueSlug = slug;

    while (true) {
      const existing = await this.articleRepository.findOne({
        where: { slug: uniqueSlug },
      });

      if (!existing || existing.id === excludeId) {
        return uniqueSlug;
      }

      counter++;
      uniqueSlug = `${slug}-${counter}`;
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 250);
  }

  private generateExcerpt(content: string, maxLength: number = 200): string {
    // Strip HTML tags if any
    const plainText = content.replace(/<[^>]*>/g, '');

    if (plainText.length <= maxLength) {
      return plainText;
    }

    // Find the last space within maxLength
    const truncated = plainText.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');

    return lastSpace > 0
      ? truncated.substring(0, lastSpace) + '...'
      : truncated + '...';
  }
}
