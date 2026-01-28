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

export enum EmailVerificationType {
  PERSONAL = 'personal',
  SCHOOL = 'school',
}

@Entity('email_verifications')
@Index(['userId', 'type'])
@Index(['token'])
export class EmailVerification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    type: 'enum',
    enum: EmailVerificationType,
  })
  type: EmailVerificationType;

  @Column({ type: 'varchar', length: 255, unique: true })
  token: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ default: 0 })
  resendCount: number;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Check if the verification token has expired
   */
  get isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  /**
   * Check if the email has been verified
   */
  get isVerified(): boolean {
    return this.verifiedAt !== null;
  }

  /**
   * Check if resend limit has been reached (max 3)
   */
  get canResend(): boolean {
    return this.resendCount < 3;
  }

  /**
   * Get remaining resend attempts
   */
  get remainingResendAttempts(): number {
    return Math.max(0, 3 - this.resendCount);
  }
}
