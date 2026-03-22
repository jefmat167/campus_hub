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
import { BuyRequest } from './buy-request.entity';
import { Conversation } from './conversation.entity';
import { ListingCondition } from './listing.entity';

export enum BuyRequestOfferStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  WITHDRAWN = 'withdrawn',
}

@Entity('buy_request_offers')
@Index(['buyRequestId', 'status', 'createdAt'])
@Index(['responderId', 'status'])
@Index(['requesterId', 'status'])
export class BuyRequestOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'buy_request_id' })
  @Index()
  buyRequestId: string;

  @ManyToOne(() => BuyRequest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buy_request_id' })
  buyRequest: BuyRequest;

  // The seller making the offer
  @Column({ name: 'responder_id' })
  @Index()
  responderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'responder_id' })
  responder: User;

  // Denormalized for efficient authorization checks (owner of buy request)
  @Column({ name: 'requester_id' })
  requesterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'proposed_price' })
  proposedPrice: number;

  @Column({
    type: 'enum',
    enum: ListingCondition,
    name: 'item_condition',
  })
  itemCondition: ListingCondition;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'image_urls' })
  imageUrls: string[] | null;

  @Column({
    type: 'enum',
    enum: BuyRequestOfferStatus,
    default: BuyRequestOfferStatus.PENDING,
  })
  @Index()
  status: BuyRequestOfferStatus;

  @Column({ type: 'timestamp', name: 'expires_at' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true, name: 'responded_at' })
  respondedAt: Date | null;

  // Link to auto-created conversation
  @Column({ type: 'uuid', nullable: true, name: 'conversation_id' })
  conversationId: string | null;

  @ManyToOne(() => Conversation, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
