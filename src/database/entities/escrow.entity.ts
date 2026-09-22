import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { DeliveryMethod } from './listing.entity';
import { BuyRequestOffer } from './buy-request-offer.entity';
import { Checkout } from './checkout.entity';
import { OrderItem } from './order-item.entity';
import { DropPoint } from './drop-point.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

export enum EscrowStatus {
  PENDING_CONFIRMATION = 'pending_confirmation', // Vendor manual-confirm / service time-negotiation (rev-2 03.5/03.6, used from Phase 5)
  AWAITING_SELLER = 'awaiting_seller', // Waiting for seller to click "I'm Ready"
  SELLER_READY = 'seller_ready', // Seller set delivery details, code generated
  DELIVERED = 'delivered', // Code verified, in 24h dispute window
  COMPLETED = 'completed', // Funds released to seller
  DISPUTED = 'disputed', // Dispute opened
  REFUNDED = 'refunded', // Dispute resolved for buyer
  CANCELLED = 'cancelled', // Cancelled before delivery
  EXPIRED = 'expired', // 72h fulfillment timer expired
}

/** Which market a sub-order belongs to (wallet rows are tagged with this). */
export enum OrderMarket {
  P2P = 'p2p',
  VENDOR = 'vendor',
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

  // Sub-order grouping (rev-2 spec 01.6/03.4): the checkout this order was
  // split out of. Null on buy-request escrows (their own direct path).
  @Column({ type: 'uuid', name: 'checkout_id', nullable: true })
  @Index()
  checkoutId: string | null;

  @ManyToOne(() => Checkout, (checkout) => checkout.orders, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'checkout_id' })
  checkout: Checkout | null;

  @Column({ type: 'uuid', name: 'buy_request_offer_id', nullable: true })
  @Index()
  buyRequestOfferId: string | null;

  @ManyToOne(() => BuyRequestOffer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'buy_request_offer_id' })
  buyRequestOffer: BuyRequestOffer | null;

  // The lines inside this sub-order (item links + price/title snapshots).
  @OneToMany(() => OrderItem, (item) => item.order)
  orderItems: OrderItem[];

  @Column({ type: 'varchar', length: 10, nullable: true })
  market: OrderMarket | null;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  amount: number;

  // Money breakdown (rev-2 01.3): platform fee applies to itemsSubtotal;
  // deliveryFee passes through to the seller/vendor in full.
  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  itemsSubtotal: number | null;

  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
  deliveryFee: number;

  // Deposit-model seam (rev-2 spec 05) — v1 is always full_upfront.
  @Column({ type: 'varchar', length: 20, default: 'full_upfront' })
  paymentPlan: string;

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

  // Vendor door delivery (Phase 5): full address, or an admin drop point.
  @Column({ type: 'text', nullable: true })
  deliveryAddress: string | null;

  @Column({ type: 'uuid', name: 'drop_point_id', nullable: true })
  dropPointId: string | null;

  @ManyToOne(() => DropPoint, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'drop_point_id' })
  dropPoint: DropPoint | null;

  // Vendor manual confirmation (rev-2 03.5, Phase 5): commitment, not readiness.
  @Column({ default: false })
  confirmationRequired: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  // Services (rev-2 03.6, Phase 6): agreed appointment; deadlines re-key to it.
  @Column({ type: 'timestamptz', nullable: true })
  appointmentAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  agreedAt: Date | null;

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

  // Cancellation provenance (rev-2 01.2 is direction-sensitive).
  @Column({ type: 'varchar', length: 10, nullable: true })
  cancelledBy: 'buyer' | 'seller' | 'system' | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cancelReason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
