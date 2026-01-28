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

export enum ModerationContentType {
  POST = 'post',
  COMMENT = 'comment',
  LISTING = 'listing',
  MESSAGE = 'message',
  PROFILE = 'profile',
  HOUSING = 'housing',
}

export enum ModerationSource {
  AI_FLAG = 'ai_flag',
  KEYWORD_FLAG = 'keyword_flag',
  USER_REPORT = 'user_report',
  MANUAL = 'manual',
}

export enum ModerationStatus {
  PENDING = 'pending',
  IN_REVIEW = 'in_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REMOVED = 'removed',
}

export enum ModerationCategory {
  SPAM = 'spam',
  HATE_SPEECH = 'hate_speech',
  HARASSMENT = 'harassment',
  VIOLENCE = 'violence',
  ADULT_CONTENT = 'adult_content',
  SCAM = 'scam',
  MISINFORMATION = 'misinformation',
  PERSONAL_INFO = 'personal_info',
  OTHER = 'other',
}

@Entity('moderation_queue')
@Index(['status', 'priority', 'createdAt'])
@Index(['contentType', 'contentId'])
export class ModerationQueue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Content being moderated
  @Column({
    type: 'enum',
    enum: ModerationContentType,
  })
  contentType: ModerationContentType;

  @Column({ name: 'content_id' })
  @Index()
  contentId: string;

  // Owner of the content
  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Why it was flagged
  @Column({
    type: 'enum',
    enum: ModerationSource,
  })
  source: ModerationSource;

  @Column({
    type: 'enum',
    enum: ModerationCategory,
    nullable: true,
  })
  category: ModerationCategory | null;

  // AI moderation details
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  aiScore: number | null;

  @Column({ type: 'jsonb', nullable: true })
  aiDetails: {
    category: string;
    confidence: number;
    flaggedTerms?: string[];
  } | null;

  // Keyword flag details
  @Column({ type: 'jsonb', nullable: true })
  flaggedKeywords: string[] | null;

  // Content snapshot (in case original is edited/deleted)
  @Column({ type: 'text', nullable: true })
  contentSnapshot: string | null;

  // Status
  @Column({
    type: 'enum',
    enum: ModerationStatus,
    default: ModerationStatus.PENDING,
  })
  @Index()
  status: ModerationStatus;

  // Priority (0-100, higher = more urgent)
  @Column({ type: 'int', default: 50 })
  @Index()
  priority: number;

  // Review details
  @Column({ type: 'uuid', name: 'reviewed_by_id', nullable: true })
  reviewedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  // Action taken
  @Column({ type: 'text', nullable: true })
  actionTaken: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
