import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { EscrowTransaction } from './escrow.entity';
import { Listing } from './listing.entity';
import { Offer } from './offer.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

export enum OrderItemType {
  P2P_LISTING = 'p2p_listing',
  VENDOR_GOODS = 'vendor_goods', // Phase 5
  VENDOR_SERVICE = 'vendor_service', // Phase 6
}

/**
 * A line inside a sub-order (rev-2 spec 03.4): one sub-order can bundle
 * several items from the same seller. Title and price are SNAPSHOTS taken at
 * checkout — later listing edits never change what was bought. Exactly one of
 * listingId / vendorListingId is set (DB CHECK).
 */
@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id' })
  @Index()
  orderId: string;

  @ManyToOne(() => EscrowTransaction, (order) => order.orderItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order: EscrowTransaction;

  @Column({ type: 'varchar', length: 20 })
  itemType: OrderItemType;

  @Column({ name: 'listing_id', type: 'uuid', nullable: true })
  @Index()
  listingId: string | null;

  @ManyToOne(() => Listing, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing | null;

  // FK arrives with vendor_listings in Phase 4/5.
  @Column({ name: 'vendor_listing_id', type: 'uuid', nullable: true })
  vendorListingId: string | null;

  // The accepted P2P offer this line's price came from (receipt, not a hold).
  @Column({ name: 'offer_id', type: 'uuid', nullable: true })
  offerId: string | null;

  @ManyToOne(() => Offer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer | null;

  @Column({ type: 'varchar', length: 255 })
  titleSnapshot: string;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  unitPrice: number;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  // Selected option groups/deltas for vendor lines (Phase 5).
  @Column({ type: 'jsonb', nullable: true })
  optionsSnapshot: Record<string, unknown> | null;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  lineTotal: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
