import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';

export enum PostVisibility {
  UNIVERSITY = 'university',
  FACULTY = 'faculty',
  DEPARTMENT = 'department',
}

export enum ReactionType {
  LIKE = 'like',
  LOVE = 'love',
  LAUGH = 'laugh',
  WOW = 'wow',
  SAD = 'sad',
  ANGRY = 'angry',
}

// JSONB interfaces for embedded data
export interface PostReaction {
  type: ReactionType;
  count: number;
  userIds: string[];
}

export interface PollOption {
  id: string;
  text: string;
  voteCount: number;
  voterIds: string[];
}

export interface Poll {
  question: string;
  options: PollOption[];
  allowMultipleVotes: boolean;
  endsAt: string | null;
  isClosed: boolean;
  totalVotes: number;
}

@Entity('posts')
@Index(['universityId', 'createdAt'])
@Index(['universityId', 'visibility', 'createdAt'])
@Index(['universityId', 'engagementScore'])
@Index(['authorId', 'createdAt'])
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'author_id' })
  @Index()
  authorId: string;

  @Column({ name: 'anonymous_id' })
  anonymousId: string;

  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @Column({ name: 'faculty_id', type: 'uuid', nullable: true })
  facultyId: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId: string | null;

  @Column({
    type: 'enum',
    enum: PostVisibility,
    default: PostVisibility.UNIVERSITY,
  })
  visibility: PostVisibility;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', name: 'image_urls', default: [] })
  imageUrls: string[];

  @Column({ type: 'jsonb', nullable: true })
  poll: Poll | null;

  @Column({
    type: 'jsonb',
    default: [
      { type: ReactionType.LIKE, count: 0, userIds: [] },
      { type: ReactionType.LOVE, count: 0, userIds: [] },
      { type: ReactionType.LAUGH, count: 0, userIds: [] },
      { type: ReactionType.WOW, count: 0, userIds: [] },
      { type: ReactionType.SAD, count: 0, userIds: [] },
      { type: ReactionType.ANGRY, count: 0, userIds: [] },
    ],
  })
  reactions: PostReaction[];

  @Column({ name: 'total_reactions', default: 0 })
  totalReactions: number;

  @Column({ name: 'comment_count', default: 0 })
  commentCount: number;

  @Column({ name: 'view_count', default: 0 })
  viewCount: number;

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

  @Column({
    name: 'engagement_score',
    type: 'decimal',
    precision: 12,
    scale: 4,
    default: 0,
  })
  engagementScore: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
