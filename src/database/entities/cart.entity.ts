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
import { Listing } from './listing.entity';
import { Offer } from './offer.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

/**
 * One cart per student (rev-2 spec 01.6 / 02.1). Carting holds NOTHING —
 * neither a single-quantity P2P listing nor vendor stock. Availability is
 * validated at checkout; a stale line is flagged, never silently dropped.
 */
@Entity('carts')
export class Cart {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => CartItem, (item) => item.cart)
  items: CartItem[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

/**
 * A cart line. `priceAtAdd` is display-only — checkout always recomputes the
 * authoritative price server-side (listed price, or the accepted offer's
 * agreed price while its 24h lock holds). One line per P2P listing per cart
 * (partial unique index).
 */
@Entity('cart_items')
@Index(['cartId'])
export class CartItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cart_id' })
  cartId: string;

  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @Column({ name: 'listing_id', type: 'uuid', nullable: true })
  listingId: string | null;

  @ManyToOne(() => Listing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing | null;

  // Vendor lines arrive in Phase 5 (FK added with vendor_listings).
  @Column({ name: 'vendor_listing_id', type: 'uuid', nullable: true })
  vendorListingId: string | null;

  // Accepted-offer price lock (24h from acceptance; never an availability hold).
  @Column({ name: 'offer_id', type: 'uuid', nullable: true })
  offerId: string | null;

  @ManyToOne(() => Offer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'offer_id' })
  offer: Offer | null;

  @Column({ type: 'int', default: 1 })
  quantity: number;

  @Column({ type: 'jsonb', nullable: true })
  selectedOptions: Record<string, unknown> | null;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  priceAtAdd: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
