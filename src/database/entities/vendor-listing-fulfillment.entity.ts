import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { VendorListing } from './vendor-listing.entity';
import { University } from './university.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

/**
 * Per-listing, per-university fulfillment config (rev-2 spec 03.2):
 * delivery is opt-in per listing per served university, each with its own
 * fee. Pickup at the shop needs no row — it's implicitly available to
 * students from every served university. Rows are only valid for
 * universities the vendor actually serves (service-enforced).
 */
@Entity('vendor_listing_fulfillment')
@Unique(['vendorListingId', 'universityId'])
export class VendorListingFulfillment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_listing_id' })
  vendorListingId: string;

  @ManyToOne(() => VendorListing, (listing) => listing.fulfillment, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendor_listing_id' })
  vendorListing: VendorListing;

  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @Column({ default: false })
  deliveryEnabled: boolean;

  // Per-listing delivery/travel fee to this university (0 = free delivery;
  // NULL when delivery is disabled). Passes through to the vendor in full.
  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  deliveryFee: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
