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

export enum ReviewType {
  BUYER_TO_SELLER = 'buyer_to_seller',
  SELLER_TO_BUYER = 'seller_to_buyer',
}

@Entity('reviews')
@Unique(['transactionId', 'reviewerId', 'type'])
@Index(['revieweeId', 'type', 'createdAt'])
export class Review {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The escrow transaction this review is for
  @Column({ name: 'transaction_id' })
  @Index()
  transactionId: string;

  @Column({ name: 'reviewer_id' })
  @Index()
  reviewerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewer_id' })
  reviewer: User;

  @Column({ name: 'reviewee_id' })
  @Index()
  revieweeId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reviewee_id' })
  reviewee: User;

  @Column({
    type: 'enum',
    enum: ReviewType,
  })
  type: ReviewType;

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
