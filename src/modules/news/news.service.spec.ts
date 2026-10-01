import { NotFoundException } from '@nestjs/common';
import { NewsService } from './news.service';
import { ArticleStatus } from '../../database/entities/article.entity';

/** GET /news/:id is public — drafts and archived (soft-deleted) articles must not leak by UUID. */
describe('NewsService.getArticleById', () => {
  function makeService(stored: any) {
    const articleRepository: any = {
      // behave like the DB: honour the status filter if one is given
      findOne: jest.fn(async ({ where }: any) =>
        stored && stored.id === where.id && (!where.status || where.status === stored.status)
          ? stored
          : null,
      ),
    };
    const svc = new NewsService(articleRepository, {} as any);
    return { svc, articleRepository };
  }

  it('filters on PUBLISHED', async () => {
    const { svc, articleRepository } = makeService({
      id: 'a1',
      status: ArticleStatus.PUBLISHED,
      author: null,
    });
    await svc.getArticleById('a1');
    expect(articleRepository.findOne.mock.calls[0][0].where).toEqual({
      id: 'a1',
      status: ArticleStatus.PUBLISHED,
    });
  });

  it.each([ArticleStatus.DRAFT, ArticleStatus.ARCHIVED])('a %s article is a 404', async (status) => {
    const { svc } = makeService({ id: 'a1', status, author: null });
    await expect(svc.getArticleById('a1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
