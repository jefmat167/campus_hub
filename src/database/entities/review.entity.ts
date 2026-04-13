import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { EscrowTransaction } from './escrow.entity';

@Entity('reviews')
@Unique(['escrowTransactionId', 'reviewerId'])
@Index(['revieweeId', 'createdAt'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The escrow transaction this review is for
  @Column({ name: 'escrow_transaction_id' })
  @Index()
  escrowTransactionId: string;

  @ManyToOne(() => EscrowTransaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_transaction_id' })
  escrowTransaction: EscrowTransaction;

  // The buyer who wrote the review
  @Column({ name: 'reviewer_id' })
  @Index()
  reviewerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  // The seller being reviewed
  @Column({ name: 'reviewee_id' })
  @Index()
  revieweeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewee_id' })
  reviewee: User;

  @Column({ type: 'smallint' })
  rating: number; // 1-5 stars

  @Column({ type: 'text', nullable: true })
  comment: string | null;

  @Column({ default: false })
  isEdited: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
