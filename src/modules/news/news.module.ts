import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NewsController } from './news.controller';
import { NewsService } from './news.service';
import { Article } from '../../database/entities/article.entity';
import { ArticleBookmark } from '../../database/entities/article-bookmark.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Article, ArticleBookmark]),
  ],
  controllers: [NewsController],
  providers: [NewsService],
  exports: [NewsService],
})
export class NewsModule {}
