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
import { Listing } from './listing.entity';
import { Offer } from './offer.entity';

export enum EscrowStatus {
  AWAITING_SELLER = 'awaiting_seller', // Waiting for seller to click "I'm Ready"
  SELLER_READY = 'seller_ready', // Seller set delivery details, code generated
  DELIVERED = 'delivered', // Code verified, in 24h dispute window
  COMPLETED = 'completed', // Funds released to seller
  DISPUTED = 'disputed', // Dispute opened
  REFUNDED = 'refunded', // Dispute resolved for buyer
  CANCELLED = 'cancelled', // Cancelled before delivery
  EXPIRED = 'expired', // 72h fulfillment timer expired
}

@Entity('escrow_transactions')
@Index(['status', 'createdAt'])
@Index(['buyerId', 'status'])
@Index(['sellerId', 'status'])
export class EscrowTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'buyer_id' })
  @Index()
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ name: 'seller_id' })
  @Index()
  sellerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'listing_id' })
  @Index()
  listingId: string;

  @ManyToOne(() => Listing, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ type: 'uuid', name: 'offer_id', nullable: true })
  offerId: string | null;

  @ManyToOne(() => Offer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer | null;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: EscrowStatus,
    default: EscrowStatus.AWAITING_SELLER,
  })
  @Index()
  status: EscrowStatus;

  // Human-readable order number (ORD-YYYY-NNNNNN)
  @Column({ unique: true })
  @Index()
  orderNumber: string;

  // Seller readiness
  @Column({ type: 'timestamp', nullable: true })
  sellerReadyAt: Date | null;

  // Delivery scheduling (set by seller when clicking "I'm Ready")
  @Column({ type: 'date', nullable: true })
  deliveryDate: Date | null;

  @Column({ type: 'time', nullable: true })
  deliveryTime: string | null; // HH:MM format

  @Column({ type: 'text', nullable: true })
  deliveryLocation: string | null;

  // Delivery confirmation
  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  // Funds release
  @Column({ type: 'timestamp', nullable: true })
  releasedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  refundedAt: Date | null;

  // Timer tracking
  @Column({ type: 'timestamp' })
  fulfillmentExpiresAt: Date; // 72h from creation

  @Column({ type: 'timestamp', nullable: true })
  disputeWindowExpiresAt: Date | null; // 24h after deliveredAt

  // Fee tracking (calculated on completion)
  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  platformFee: number; // 2.5% of amount

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  sellerPayout: number; // amount - platformFee

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
