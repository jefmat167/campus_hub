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

export enum BanAppealStatus {
  PENDING = 'pending',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('ban_appeals')
@Index(['status', 'createdAt'])
export class BanAppeal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Appeal details
  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', nullable: true })
  evidence: string[] | null;

  // Status
  @Column({
    type: 'enum',
    enum: BanAppealStatus,
    default: BanAppealStatus.PENDING,
  })
  @Index()
  status: BanAppealStatus;

  // Admin review
  @Column({ type: 'uuid', name: 'reviewed_by_id', nullable: true })
  reviewedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reviewed_by_id' })
  reviewedBy: User | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  // Track original ban details at time of appeal
  @Column({ type: 'text', nullable: true })
  originalBanReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  originalBanDate: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  originalBanExpiry: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
