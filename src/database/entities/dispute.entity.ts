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
import { EscrowTransaction } from './escrow.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

export enum DisputeStatus {
  OPEN = 'open',
  UNDER_REVIEW = 'under_review',
  RESOLVED_BUYER = 'resolved_buyer', // Refund to buyer
  RESOLVED_SELLER = 'resolved_seller', // Release to seller
  RESOLVED_SPLIT = 'resolved_split', // Split between both
  CLOSED = 'closed',
}

export enum DisputeReason {
  ITEM_NOT_RECEIVED = 'item_not_received',
  ITEM_NOT_AS_DESCRIBED = 'item_not_as_described',
  ITEM_DAMAGED = 'item_damaged',
  SELLER_UNRESPONSIVE = 'seller_unresponsive',
  BUYER_UNRESPONSIVE = 'buyer_unresponsive',
  PAYMENT_ISSUE = 'payment_issue',
  FRAUD = 'fraud',
  OTHER = 'other',
}

@Entity('disputes')
@Index(['status', 'createdAt'])
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'escrow_id' })
  @Index()
  escrowId: string;

  @ManyToOne(() => EscrowTransaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow: EscrowTransaction;

  @Column({ name: 'opened_by_id' })
  openedById: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'opened_by_id' })
  openedBy: User;

  @Column({
    type: 'enum',
    enum: DisputeReason,
  })
  reason: DisputeReason;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  evidence: string[] | null; // URLs to evidence images/files

  @Column({
    type: 'enum',
    enum: DisputeStatus,
    default: DisputeStatus.OPEN,
  })
  @Index()
  status: DisputeStatus;

  // Admin response
  @Column({ type: 'uuid', name: 'resolved_by_id', nullable: true })
  resolvedById: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by_id' })
  resolvedBy: User | null;

  @Column({ type: 'text', nullable: true })
  resolution: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  buyerRefundAmount: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  sellerReleaseAmount: number | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
