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
import { KoboColumnTransformer } from '../../common/utils/money';
import { User } from './user.entity';
import { University } from './university.entity';
import { Faculty } from './faculty.entity';
import { Department } from './department.entity';

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

export enum DeliveryMethod {
  PICKUP = 'pickup',
  MEETUP = 'meetup',
}

export enum ListingStatus {
  ACTIVE = 'active',
  SOLD = 'sold',
  IN_ESCROW = 'in_escrow',
  PAUSED = 'paused',
  DELETED = 'deleted',
}

export enum ListingType {
  SELL = 'sell',
  BUY_REQUEST = 'buy_request',
}

@Entity('listings')
@Index(['universityId', 'status', 'createdAt'])
@Index(['universityId', 'category', 'status'])
@Index(['sellerId', 'status'])
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'seller_id' })
  @Index()
  sellerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'seller_id' })
  seller: User;

  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @Column({
    type: 'enum',
    enum: ListingType,
    default: ListingType.SELL,
  })
  type: ListingType;

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

  @Column({
    type: 'enum',
    enum: ListingCondition,
  })
  condition: ListingCondition;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  price: number;

  @Column({ default: true })
  isNegotiable: boolean;

  @Column({
    type: 'enum',
    enum: VisibilityScope,
    default: VisibilityScope.UNIVERSITY,
  })
  visibilityScope: VisibilityScope;

  // For department/faculty scoped listings
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

  // P2P handover is meet-up only (rev-2 spec 02): at least 3 named public
  // meet-up points; the buyer picks one at purchase. No seller-location
  // pickup, no door delivery — shop pickup is a vendors'-market concept.
  @Column({ type: 'jsonb' })
  meetupPoints: string[];

  @Column({
    type: 'enum',
    enum: ListingStatus,
    default: ListingStatus.ACTIVE,
  })
  @Index()
  status: ListingStatus;

  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  favoriteCount: number;

  @OneToMany(() => ListingImage, (image) => image.listing, { cascade: true })
  images: ListingImage[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
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
