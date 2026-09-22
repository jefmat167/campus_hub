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
  Check,
} from 'typeorm';
import { KoboColumnTransformer } from '../../common/utils/money';
import { User } from './user.entity';
import { University } from './university.entity';
import { Faculty } from './faculty.entity';
import { Department } from './department.entity';
import { VendorProfile } from './vendor-profile.entity';
import { VendorOptionGroup } from './vendor-option.entity';

export enum ListingCategory {
  ELECTRONICS = 'electronics',
  FURNITURE = 'furniture',
  BOOKS = 'books',
  CLOTHING = 'clothing',
  APPLIANCES = 'appliances',
  PHONES = 'phones',
  LAPTOPS = 'laptops',
  ACCESSORIES = 'accessories',
  SPORTS = 'sports',
  BEAUTY = 'beauty',
  FOOD = 'food',
  SERVICES = 'services',
  OTHER = 'other',
}

export enum ListingCondition {
  NEW = 'new',
  LIKE_NEW = 'like_new',
  USED_GOOD = 'used_good',
  USED_FAIR = 'used_fair',
}

export enum VisibilityScope {
  DEPARTMENT = 'department',
  FACULTY = 'faculty',
  UNIVERSITY = 'university',
}

// P2P orders are MEETUP-only (rev-2 02). PICKUP (shop collection) and
// DELIVERY (address / drop point) belong to vendor orders. Stored in plain
// varchar columns — no PG enum to migrate.
export enum DeliveryMethod {
  DELIVERY = 'delivery',
  PICKUP = 'pickup',
  MEETUP = 'meetup',
}

export enum ListingStatus {
  ACTIVE = 'active',
  SOLD = 'sold', // p2p only
  IN_ESCROW = 'in_escrow', // p2p only
  PAUSED = 'paused',
  DELETED = 'deleted',
}

/**
 * What kind of thing a listing is — the discriminator of the ONE listings
 * table (unified marketplace, 2026-09). Every kind shares title / photos /
 * price / category / status; the per-kind columns are nullable with CHECK
 * constraints so each kind keeps the guarantees its own table used to have.
 */
export enum ListingKind {
  /** Student resale: single item, negotiable, meet-up handover. */
  P2P = 'p2p',
  /** Shop stock item: quantity, option groups, pickup / delivery. */
  VENDOR_GOODS = 'vendor_goods',
  /** Bookable service: no stock, time negotiation, always manual-confirm. */
  VENDOR_SERVICE = 'vendor_service',
}

export const VENDOR_LISTING_KINDS: readonly ListingKind[] = [
  ListingKind.VENDOR_GOODS,
  ListingKind.VENDOR_SERVICE,
];

export function isVendorKind(kind: ListingKind): boolean {
  return kind !== ListingKind.P2P;
}

@Entity('listings')
@Index(['universityId', 'status', 'createdAt']) // campus feed, newest first
@Index(['universityId', 'category', 'status']) // campus feed by category
@Index(['kind', 'status', 'createdAt']) // kind filter on the unified feed
@Index(['sellerId', 'status']) // "my listings"
@Index(['vendorProfileId', 'status']) // vendor catalog + storefront
@Check(
  'CHK_listings_vendor_profile',
  `("kind" = 'p2p') = ("vendor_profile_id" IS NULL)`,
)
@Check(
  'CHK_listings_p2p_shape',
  `"kind" <> 'p2p' OR ("condition" IS NOT NULL AND "meetupPoints" IS NOT NULL AND "stock" IS NULL AND "manualConfirm" = false AND "pickupOnly" = false)`,
)
@Check(
  'CHK_listings_vendor_shape',
  `"kind" = 'p2p' OR ("isNegotiable" = false AND "meetupPoints" IS NULL AND "visibilityScope" = 'university' AND "status" NOT IN ('sold', 'in_escrow'))`,
)
@Check(
  'CHK_listings_service_shape',
  `"kind" <> 'vendor_service' OR ("stock" IS NULL AND "manualConfirm" = true)`,
)
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 16 })
  @Index()
  kind: ListingKind;

  // ── who is selling ──────────────────────────────────────────────
  // Always a user: the student, or the vendor's one account.
  @Column({ name: 'seller_id' })
  @Index()
  sellerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  // Vendor kinds only. Business identity, verification, served campuses and
  // vendor status stay on vendor_profiles.
  @Column({ type: 'uuid', name: 'vendor_profile_id', nullable: true })
  vendorProfileId: string | null;

  @ManyToOne(() => VendorProfile, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vendor_profile_id' })
  vendorProfile: VendorProfile | null;

  // ── where it is listed ──────────────────────────────────────────
  // P2P: the seller's campus — the only place it shows.
  // Vendor: the vendor's HOME campus (denormalised); it additionally shows on
  // every campus in vendor_universities, resolved in the feed query.
  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  // P2P only: narrow to a faculty / department. Vendor rows stay 'university'.
  @Column({
    type: 'enum',
    enum: VisibilityScope,
    default: VisibilityScope.UNIVERSITY,
  })
  visibilityScope: VisibilityScope;

  @Column({ type: 'uuid', nullable: true, name: 'faculty_id' })
  facultyId: string | null;

  @ManyToOne(() => Faculty, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'faculty_id' })
  faculty: Faculty | null;

  @Column({ type: 'uuid', nullable: true, name: 'department_id' })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'department_id' })
  department: Department | null;

  // ── what it is ──────────────────────────────────────────────────
  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: ListingCategory,
  })
  @Index()
  category: ListingCategory;

  // P2P: the asking price. Vendor: the base price before option deltas.
  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  price: number;

  // P2P only (CHK_listings_p2p_shape); vendor goods are new by definition.
  @Column({
    type: 'enum',
    enum: ListingCondition,
    nullable: true,
  })
  condition: ListingCondition | null;

  // P2P only — vendor prices are fixed (CHECK forces false).
  @Column({ default: false })
  isNegotiable: boolean;

  // ── how it is handed over ───────────────────────────────────────
  // P2P only (rev-2 spec 02): 3–5 named public meet-up points, the buyer picks
  // one at checkout. Vendor pickup / delivery is a per-campus preset on the
  // vendor (VendorUniversity fees + VendorDeliveryPoint rows); listings only
  // opt OUT of it via pickupOnly.
  @Column({ type: 'jsonb', nullable: true })
  meetupPoints: string[] | null;

  // vendor_goods only. NULL = untracked → manual confirmation is FORCED (no
  // stock signal to trust); tracked (>= 0) permits auto-confirmation. Services
  // and P2P: always NULL.
  @Column({ type: 'int', nullable: true })
  stock: number | null;

  // The vendor confirms each order by hand. Forced true for services and for
  // untracked stock; always false for P2P.
  @Column({ default: false })
  manualConfirm: boolean;

  // Vendor kinds only (CHECK forces false for P2P). Opts this one listing OUT
  // of the vendor's per-campus delivery preset: goods are never delivered,
  // services never travel — pickup / at-the-shop is all the buyer gets.
  @Column({ default: false })
  pickupOnly: boolean;

  // ── state ───────────────────────────────────────────────────────
  @Column({
    type: 'enum',
    enum: ListingStatus,
    default: ListingStatus.ACTIVE,
  })
  @Index()
  status: ListingStatus;

  @Column({ default: 0 })
  viewCount: number;

  // Meaningful for every kind — favorites point at listings.id.
  @Column({ default: 0 })
  favoriteCount: number;

  // ── relations that hang off the one table ───────────────────────
  @OneToMany(() => ListingImage, (image) => image.listing, { cascade: true })
  images: ListingImage[];

  /** Vendor kinds: variants and add-ons. Empty for P2P. */
  @OneToMany(() => VendorOptionGroup, (group) => group.listing)
  optionGroups: VendorOptionGroup[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('listing_images')
@Index(['listingId', 'position'])
export class ListingImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'listing_id' })
  @Index()
  listingId: string;

  @ManyToOne(() => Listing, (listing) => listing.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing;

  @Column({ length: 500 })
  url: string;

  @Column({ default: 0 })
  position: number;

  @CreateDateColumn()
  createdAt: Date;
}
