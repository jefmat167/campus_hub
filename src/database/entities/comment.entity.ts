import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Post, PostReaction, ReactionType } from './post.entity';

@Entity('comments')
@Index(['postId', 'createdAt'])
@Index(['postId', 'parentId', 'createdAt'])
@Index(['authorId', 'createdAt'])
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id' })
  @Index()
  postId: string;

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'post_id' })
  post: Post;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  @Index()
  parentId: string | null;

  @ManyToOne(() => Comment, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent: Comment | null;

  @Column({ name: 'author_id' })
  @Index()
  authorId: string;

  @Column({ name: 'anonymous_id' })
  anonymousId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({
    type: 'jsonb',
    default: [
      { type: ReactionType.LIKE, count: 0, userIds: [] },
      { type: ReactionType.LOVE, count: 0, userIds: [] },
      { type: ReactionType.LAUGH, count: 0, userIds: [] },
    ],
  })
  reactions: PostReaction[];

  @Column({ name: 'total_reactions', default: 0 })
  totalReactions: number;

  @Column({ name: 'reply_count', default: 0 })
  replyCount: number;

  @Column({ default: 0 })
  depth: number;

  @Column({ name: 'is_edited', default: false })
  isEdited: boolean;

  @Column({ name: 'is_deleted', default: false })
  @Index()
  isDeleted: boolean;

  @Column({ name: 'is_hidden', default: false })
  isHidden: boolean;

  @Column({ name: 'hidden_reason', type: 'text', nullable: true })
  hiddenReason: string | null;

  @Column({ name: 'report_count', default: 0 })
  reportCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
