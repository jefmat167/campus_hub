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

export enum ReportType {
  POST = 'post',
  COMMENT = 'comment',
  LISTING = 'listing',
  USER = 'user',
  MESSAGE = 'message',
  HOUSING = 'housing',
}

export enum ReportReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  HATE_SPEECH = 'hate_speech',
  VIOLENCE = 'violence',
  NUDITY = 'nudity',
  SCAM = 'scam',
  FAKE_LISTING = 'fake_listing',
  IMPERSONATION = 'impersonation',
  MISINFORMATION = 'misinformation',
  ILLEGAL_CONTENT = 'illegal_content',
  UNDERAGE = 'underage',
  SELF_HARM = 'self_harm',
  OTHER = 'other',
}

export enum ReportStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  ACTION_TAKEN = 'action_taken',
  DISMISSED = 'dismissed',
}

export enum ReportAction {
  NONE = 'none',
  WARNING_ISSUED = 'warning_issued',
  CONTENT_REMOVED = 'content_removed',
  USER_BANNED_TEMP = 'user_banned_temp',
  USER_BANNED_PERM = 'user_banned_perm',
}

@Entity('reports')
@Index(['status', 'createdAt'])
@Index(['type', 'targetId'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Who reported
  @Column({ name: 'reporter_id' })
  @Index()
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  // What type of content is being reported
  @Column({
    type: 'enum',
    enum: ReportType,
  })
  type: ReportType;

  // ID of the reported content (post ID, user ID, listing ID, etc.)
  @Column({ name: 'target_id' })
  @Index()
  targetId: string;

  // Who is being reported (owner of the content)
  @Column({ type: 'uuid', name: 'reported_user_id', nullable: true })
  @Index()
  reportedUserId: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reported_user_id' })
  reportedUser: User | null;

  // Report details
  @Column({
    type: 'enum',
    enum: ReportReason,
  })
  reason: ReportReason;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'jsonb', nullable: true })
  evidence: string[] | null; // URLs to screenshots or other evidence

  // Status and resolution
  @Column({
    type: 'enum',
    enum: ReportStatus,
    default: ReportStatus.PENDING,
  })
  @Index()
  status: ReportStatus;

  @Column({
    type: 'enum',
    enum: ReportAction,
    nullable: true,
  })
  action: ReportAction | null;

  // Moderator handling
  @Column({ type: 'uuid', name: 'reviewed_by_id', nullable: true })
  reviewedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  // Priority scoring (higher = more urgent)
  @Column({ type: 'int', default: 0 })
  @Index()
  priority: number;

  // Track duplicate reports for same content
  @Column({ default: 1 })
  reportCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
