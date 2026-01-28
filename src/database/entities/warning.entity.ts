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
import { Report } from './report.entity';

export enum WarningReason {
  SPAM = 'spam',
  HARASSMENT = 'harassment',
  INAPPROPRIATE_CONTENT = 'inappropriate_content',
  POLICY_VIOLATION = 'policy_violation',
  SCAM_ATTEMPT = 'scam_attempt',
  OTHER = 'other',
}

@Entity('warnings')
@Index(['userId', 'createdAt'])
export class Warning {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Who issued the warning
  @Column({ name: 'issued_by_id' })
  issuedById: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'issued_by_id' })
  issuedBy: User;

  // Warning details
  @Column({
    type: 'enum',
    enum: WarningReason,
  })
  reason: WarningReason;

  @Column({ type: 'text' })
  message: string;

  // Link to report if this warning came from a report
  @Column({ type: 'uuid', name: 'report_id', nullable: true })
  reportId: string | null;

  @ManyToOne(() => Report, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'report_id' })
  report: Report | null;

  // Track if user acknowledged the warning
  @Column({ default: false })
  acknowledged: boolean;

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt: Date | null;

  // Warning expiry (warnings may expire after certain period)
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
