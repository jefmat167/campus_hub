import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum ArticleStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
}

export enum ArticleCategory {
  NEWS = 'news',
  TIPS = 'tips',
  ANNOUNCEMENTS = 'announcements',
  CAMPUS_LIFE = 'campus_life',
  SAFETY = 'safety',
  EVENTS = 'events',
  MARKETPLACE_TIPS = 'marketplace_tips',
  HOUSING = 'housing',
  GENERAL = 'general',
}

@Entity('articles')
@Index(['status', 'publishedAt'])
@Index(['category', 'status'])
export class Article {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  title: string;

  @Column({ length: 300, unique: true })
  @Index()
  slug: string;

  @Column({ type: 'text', nullable: true })
  excerpt: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  coverImageUrl: string | null;

  @Column({
    type: 'enum',
    enum: ArticleCategory,
    default: ArticleCategory.GENERAL,
  })
  @Index()
  category: ArticleCategory;

  @Column({ type: 'jsonb', nullable: true })
  tags: string[];

  @Column({
    type: 'enum',
    enum: ArticleStatus,
    default: ArticleStatus.DRAFT,
  })
  @Index()
  status: ArticleStatus;

  @Column({ default: false })
  @Index()
  isFeatured: boolean;

  // Author
  @Column({ name: 'author_id' })
  authorId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: User;

  // Engagement metrics
  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  bookmarkCount: number;

  // Publishing
  @Column({ type: 'timestamp', nullable: true })
  @Index()
  publishedAt: Date | null;

  // SEO
  @Column({ type: 'varchar', length: 160, nullable: true })
  metaDescription: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metaKeywords: string[];

  // Reading time in minutes (auto-calculated)
  @Column({ type: 'int', default: 1 })
  readingTime: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
