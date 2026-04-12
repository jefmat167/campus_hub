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

export enum DocumentType {
  STUDENT_ID_FRONT = 'student_id_front',
  STUDENT_ID_BACK = 'student_id_back',
  SCHOOL_FEES_RECEIPT = 'school_fees_receipt',
  /**
   * @deprecated Use SCHOOL_FEES_RECEIPT instead
   */
  TUITION_RECEIPT = 'tuition_receipt',
  /**
   * @deprecated No longer used in verification flow
   */
  ADMISSION_LETTER = 'admission_letter',
}

export enum DocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('verification_documents')
@Index(['userId', 'type'])
@Index(['userId', 'status'])
export class VerificationDocument {
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
    enum: DocumentType,
  })
  type: DocumentType;

  @Column({ length: 500 })
  documentUrl: string;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.PENDING,
  })
  @Index()
  status: DocumentStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reviewedBy: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  /**
   * Submission attempt number (1, 2, or 3)
   * Users can resubmit documents up to 3 times if rejected
   */
  @Column({ default: 1 })
  submissionAttempt: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
