import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { University } from './university.entity';
import { VendorUniversity } from './vendor-university.entity';

/**
 * Vendor lifecycle (marketplace rev-2 spec 03.1):
 * draft → pending_review → active | rejected (re-submittable), active ⇄ suspended.
 *
 * DRAFT exists because Door-2 (external business) registration happens before
 * the account can upload the shopfront photo — the authed "submit for review"
 * step completes the application, mirroring the Tier-1 student-docs flow.
 */
export enum VendorStatus {
  DRAFT = 'draft',
  PENDING_REVIEW = 'pending_review',
  ACTIVE = 'active',
  REJECTED = 'rejected',
  SUSPENDED = 'suspended',
}

/**
 * Vendor status is a PROFILE on the one user account — never a second login
 * or a second wallet (spec 01.5). Door-1: a Tier-2 student's account gains
 * this profile. Door-2: a vendor-only account (no student identity) carries
 * it from registration.
 */
@Entity('vendor_profiles')
export class VendorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  @Index()
  userId: string;

  // RESTRICT: a vendor with a wallet/ledger history must be deactivated, not deleted.
  @OneToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'business_name', length: 255 })
  businessName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Where the shop physically is. Must be one of the served universities.
  @Column({ name: 'home_university_id' })
  @Index()
  homeUniversityId: string;

  @ManyToOne(() => University, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'home_university_id' })
  homeUniversity: University;

  @Column({ type: 'varchar', length: 20, default: VendorStatus.DRAFT })
  @Index()
  status: VendorStatus;

  // Live-captured in-app (required before review — spec 03.1).
  @Column({
    name: 'shopfront_photo_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  shopfrontPhotoUrl: string | null;

  @Column({ name: 'photo_captured_live', default: false })
  photoCapturedLive: boolean;

  // Optional CAC registration → the Verified badge (spec 03.1).
  @Column({ name: 'cac_number', type: 'varchar', length: 50, nullable: true })
  cacNumber: string | null;

  @Column({
    name: 'cac_document_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  cacDocumentUrl: string | null;

  @Column({ name: 'is_verified', default: false })
  isVerified: boolean;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'suspension_reason', type: 'text', nullable: true })
  suspensionReason: string | null;

  @Column({ name: 'reviewed_by', type: 'varchar', length: 255, nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  // When the application entered PENDING_REVIEW (queue ordering).
  @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @OneToMany(() => VendorUniversity, (vu) => vu.vendorProfile)
  servedUniversities: VendorUniversity[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
