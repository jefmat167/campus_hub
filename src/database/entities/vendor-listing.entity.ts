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
import { VendorProfile } from './vendor-profile.entity';
import { ListingCategory } from './listing.entity';
import { VendorOptionGroup } from './vendor-option.entity';
import { VendorListingFulfillment } from './vendor-listing-fulfillment.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

export enum VendorListingType {
  GOODS = 'goods',
  SERVICE = 'service',
}

export enum VendorListingStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DELETED = 'deleted',
}

/**
 * A vendors'-market catalog item (rev-2 spec 03.3): goods or a service.
 *
 * Stock semantics (spec 03.5 + decision log #8):
 * - `stock` NULL = untracked → manual confirmation is FORCED (no stock signal
 *   to trust); tracked stock (>=0) permits auto-confirmation.
 * - Services never carry stock and are always manual-confirm (their
 *   "confirmation" is the time negotiation, Phase 6).
 * Option groups can carry their own per-option stock; a REQUIRED group whose
 * tracked options are all at 0 makes the whole listing display sold out.
 */
@Entity('vendor_listings')
@Index(['vendorProfileId', 'status'])
@Index(['category', 'status'])
export class VendorListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_profile_id' })
  @Index()
  vendorProfileId: string;

  @ManyToOne(() => VendorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_profile_id' })
  vendorProfile: VendorProfile;

  @Column({ type: 'varchar', length: 10 })
  type: VendorListingType;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  // Reuses the ListingCategory value set (varchar, no PG enum).
  @Column({ type: 'varchar', length: 30 })
  category: ListingCategory;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  basePrice: number;

  // NULL = untracked (goods only; services always NULL).
  @Column({ type: 'int', nullable: true })
  stock: number | null;

  @Column({ default: false })
  manualConfirm: boolean;

  @Column({ type: 'varchar', length: 10, default: VendorListingStatus.ACTIVE })
  status: VendorListingStatus;

  @Column({ type: 'int', default: 0 })
  viewCount: number;

  @OneToMany(() => VendorListingImage, (image) => image.vendorListing, {
    cascade: true,
  })
  images: VendorListingImage[];

  @OneToMany(() => VendorOptionGroup, (group) => group.vendorListing)
  optionGroups: VendorOptionGroup[];

  @OneToMany(
    () => VendorListingFulfillment,
    (fulfillment) => fulfillment.vendorListing,
  )
  fulfillment: VendorListingFulfillment[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('vendor_listing_images')
@Index(['vendorListingId', 'position'])
export class VendorListingImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_listing_id' })
  vendorListingId: string;

  @ManyToOne(() => VendorListing, (listing) => listing.images, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendor_listing_id' })
  vendorListing: VendorListing;

  @Column({ length: 500 })
  url: string;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
