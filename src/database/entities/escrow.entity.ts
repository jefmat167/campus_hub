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
import { Listing, DeliveryMethod } from './listing.entity';
import { Offer } from './offer.entity';
import { BuyRequestOffer } from './buy-request-offer.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

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

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  @Column({ name: 'seller_id' })
  @Index()
  sellerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ type: 'uuid', name: 'listing_id', nullable: true })
  @Index()
  listingId: string | null;

  @ManyToOne(() => Listing, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing | null;

  @Column({ type: 'uuid', name: 'buy_request_offer_id', nullable: true })
  @Index()
  buyRequestOfferId: string | null;

  @ManyToOne(() => BuyRequestOffer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'buy_request_offer_id' })
  buyRequestOffer: BuyRequestOffer | null;

  @Column({ type: 'uuid', name: 'offer_id', nullable: true })
  offerId: string | null;

  @ManyToOne(() => Offer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer | null;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
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

  // Delivery method + resolved location, chosen by the buyer at order time
  // (snapshotted from the listing; null for buy-request escrows).
  @Column({ type: 'varchar', length: 20, nullable: true })
  deliveryMethod: DeliveryMethod | null;

  // deliveryDate/deliveryTime are set by the seller at "I'm Ready" (meet-up
  // only); deliveryLocation is the pickup address / chosen meet-up point,
  // snapshotted at order time.
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
  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
  platformFee: number; // 2.5% of amount

  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
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
