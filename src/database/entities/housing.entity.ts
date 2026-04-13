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
import { University } from './university.entity';

export enum HousingType {
  APARTMENT = 'apartment',
  ROOM = 'room',
  SHARED_ROOM = 'shared_room',
  HOSTEL = 'hostel',
  SELF_CONTAIN = 'self_contain',
  FLAT = 'flat',
}

export enum HousingStatus {
  AVAILABLE = 'available',
  TAKEN = 'taken',
  RESERVED = 'reserved',
  PAUSED = 'paused',
  UNDER_REVIEW = 'under_review',
  EXPIRED = 'expired',
  DELETED = 'deleted',
}

export enum FurnishingStatus {
  FURNISHED = 'furnished',
  SEMI_FURNISHED = 'semi_furnished',
  UNFURNISHED = 'unfurnished',
}

export enum GenderPreference {
  MALE_ONLY = 'male_only',
  FEMALE_ONLY = 'female_only',
  ANY = 'any',
}

export enum PaymentFrequency {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

export enum PosterRelationship {
  CURRENT_TENANT = 'current_tenant',
  PAST_TENANT = 'past_tenant',
  KNOWS_LANDLORD = 'knows_landlord',
}

@Entity('housing_listings')
@Index(['universityId', 'status', 'createdAt'])
@Index(['universityId', 'type', 'status'])
@Index(['posterId', 'status'])
@Index(['price', 'status'])
@Index(['expiresAt'])
export class HousingListing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'poster_id' })
  @Index()
  posterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'poster_id' })
  poster: User;

  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'enum',
    enum: HousingType,
  })
  @Index()
  type: HousingType;

  @Column({
    type: 'enum',
    enum: HousingStatus,
    default: HousingStatus.AVAILABLE,
  })
  @Index()
  status: HousingStatus;

  @Column({
    type: 'enum',
    enum: PosterRelationship,
  })
  posterRelationship: PosterRelationship;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: PaymentFrequency,
  })
  paymentFrequency: PaymentFrequency;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  cautionFee: number | null; // Security deposit

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  agentFee: number | null;

  @Column({ length: 500 })
  address: string;

  @Column({ length: 255 })
  area: string; // Neighborhood/Area name

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude: number | null;

  @Column({ default: 1 })
  bedrooms: number;

  @Column({ default: 1 })
  bathrooms: number;

  @Column({
    type: 'enum',
    enum: FurnishingStatus,
    default: FurnishingStatus.UNFURNISHED,
  })
  furnishing: FurnishingStatus;

  @Column({
    type: 'enum',
    enum: GenderPreference,
    default: GenderPreference.ANY,
  })
  genderPreference: GenderPreference;

  // Amenities
  @Column({ default: false })
  hasWater: boolean;

  @Column({ default: false })
  hasElectricity: boolean;

  @Column({ default: false })
  hasInternet: boolean;

  @Column({ default: false })
  hasParking: boolean;

  @Column({ default: false })
  hasSecurityGuard: boolean;

  @Column({ default: false })
  hasGenerator: boolean;

  @Column({ default: false })
  hasPrepaidMeter: boolean;

  @Column({ default: false })
  isGated: boolean;

  @Column({ default: false })
  allowsPets: boolean;

  @Column({ type: 'jsonb', nullable: true })
  otherAmenities: string[] | null;

  @Column({ type: 'jsonb', default: [] })
  imageUrls: string[];

  @Column({ type: 'varchar', length: 500, nullable: true })
  videoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  rules: string | null; // House rules

  @Column({ type: 'date', nullable: true })
  availableFrom: Date | null;

  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  inquiryCount: number;

  @Column({ default: 0 })
  reportCount: number;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
