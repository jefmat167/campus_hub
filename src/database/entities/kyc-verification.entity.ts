import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum KycType {
  BVN = 'bvn',
  NIN = 'nin',
}

export enum KycStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('kyc_verifications')
@Index(['userId', 'type'])
export class KycVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: KycType,
  })
  type: KycType;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.PENDING,
  })
  @Index()
  status: KycStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  youverifyReference: string | null;

  @Column({ default: 1 })
  attemptNumber: number;

  @Column({ type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Check if verification was successful
   */
  get isSuccess(): boolean {
    return this.status === KycStatus.SUCCESS;
  }

  /**
   * Check if verification failed
   */
  get isFailed(): boolean {
    return this.status === KycStatus.FAILED;
  }
}
