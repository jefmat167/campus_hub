import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToOne,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { University } from './university.entity';
import { Faculty } from './faculty.entity';
import { Department } from './department.entity';

/**
 * Verification Tier System:
 * - NONE: Just registered, can only browse
 * - TIER_0: Phone + Email verified, can buy ≤₦30k, chat, post, fund wallet
 * - TIER_1: Student docs approved, can sell ≤₦30k, buy ≤₦60k, roommates, housing ≤₦50k/month
 * - TIER_2: BVN/NIN verified, unlimited access
 */
export enum VerificationTier {
  NONE = 'none',
  TIER_0 = 'tier_0',
  TIER_1 = 'tier_1',
  TIER_2 = 'tier_2',
}

/**
 * Tier 1 document review status
 */
export enum Tier1ReviewStatus {
  NOT_SUBMITTED = 'not_submitted',
  PENDING_REVIEW = 'pending_review',
  PENDING_SCHOOL_EMAIL = 'pending_school_email',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum UserRole {
  USER = 'user',
}

export enum YearOfStudy {
  YEAR_1 = '1',
  YEAR_2 = '2',
  YEAR_3 = '3',
  YEAR_4 = '4',
  YEAR_5 = '5',
  YEAR_6 = '6',
  POSTGRADUATE = 'postgraduate',
}

export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
}

/**
 * Account kind (marketplace rev-2 spec 01.5). STUDENT accounts carry academic
 * identity (university/faculty/department/gender); VENDOR accounts (Door-2
 * external businesses) have none — vendor standing lives on VendorProfile.
 * Stored as varchar (not a PG enum) so new kinds never need an ALTER TYPE.
 */
export enum AccountType {
  STUDENT = 'student',
  VENDOR = 'vendor',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  @Index()
  phone: string;

  @Column({ default: false })
  phoneVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  phoneVerifiedAt: Date | null;

  @Column({ default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt: Date | null;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  email: string;

  @Column({ type: 'varchar', length: 255 })
  @Exclude()
  passwordHash: string;

  // Transaction PIN (money-out step-up) — bcrypt hash + failed-attempt lockout.
  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude()
  pinHash: string | null;

  @Column({ type: 'int', default: 0 })
  @Exclude()
  pinAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  @Exclude()
  pinLockedUntil: Date | null;

  @Column({ type: 'varchar', length: 255 })
  fullName: string;

  // Nullable: vendor-only accounts carry no gender (rev-2 spec 01.5);
  // required for students at the DTO level.
  @Column({ type: 'enum', enum: Gender, nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profilePhotoUrl: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Column({
    type: 'enum',
    enum: YearOfStudy,
    nullable: true,
  })
  yearOfStudy: YearOfStudy;

  // Academic identity — nullable since rev-2 (vendor-only accounts have none;
  // student surfaces gate on "has a student identity", not "is logged in").
  @Column({ name: 'university_id', nullable: true })
  @Index()
  universityId: string | null;

  @ManyToOne(() => University, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @Column({ name: 'faculty_id', nullable: true })
  @Index()
  facultyId: string | null;

  @ManyToOne(() => Faculty, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'faculty_id' })
  faculty: Faculty;

  @Column({ name: 'department_id', nullable: true })
  @Index()
  departmentId: string | null;

  @ManyToOne(() => Department, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'department_id' })
  department: Department;

  // Account kind — see AccountType. Varchar column, indexed.
  @Column({
    name: 'account_type',
    type: 'varchar',
    length: 20,
    default: AccountType.STUDENT,
  })
  @Index()
  accountType: AccountType;

  /**
   * Runtime-only (NOT a column): the caller's vendor-profile status, attached
   * by JwtStrategy for accountType=VENDOR requests so guards can compute the
   * effective tier without extra queries (common/utils/effective-tier.ts).
   */
  vendorStatus?: string | null;

  // Verification Tier System
  @Column({
    type: 'enum',
    enum: VerificationTier,
    default: VerificationTier.NONE,
  })
  @Index()
  verificationTier: VerificationTier;

  // School email (optional, for Tier 1 verification)
  @Column({ type: 'varchar', length: 255, nullable: true })
  schoolEmail: string | null;

  @Column({ default: false })
  schoolEmailVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  schoolEmailVerifiedAt: Date | null;

  // Tier 1 (Student Document Verification)
  @Column({
    type: 'enum',
    enum: Tier1ReviewStatus,
    default: Tier1ReviewStatus.NOT_SUBMITTED,
  })
  @Index()
  tier1ReviewStatus: Tier1ReviewStatus;

  @Column({ type: 'timestamp', nullable: true })
  tier1ApprovedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  tier1ApprovedBy: string | null;

  @Column({ default: 0 })
  tier1RejectionCount: number;

  @Column({ type: 'text', nullable: true })
  tier1RejectionReason: string | null;

  // Tier 2 (KYC Verification)
  @Column({ type: 'timestamp', nullable: true })
  tier2VerifiedAt: Date | null;

  @Column({ default: false })
  bvnVerified: boolean;

  @Column({ default: false })
  ninVerified: boolean;

  @Column({ default: 0 })
  kycAttemptCount: number;

  // Trust and Safety
  @Column({ default: false })
  @Index()
  isBanned: boolean;

  @Column({ type: 'text', nullable: true })
  banReason: string | null;

  @Column({ type: 'timestamp', nullable: true })
  banExpiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  bannedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bannedBy: string | null;

  // Device tracking for ban enforcement
  @Column({ type: 'varchar', length: 255, nullable: true })
  @Index()
  deviceId: string;

  // Soft delete and deactivation
  @Column({ default: false })
  @Index()
  isDeleted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ default: false })
  isDeactivated: boolean;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  scheduledDeletionAt: Date | null;

  // Ratings
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  sellerRating: number;

  @Column({ default: 0 })
  sellerRatingCount: number;

  @Column({ default: 0 })
  completedTransactions: number;

  // Refresh token hash for logout functionality
  @Column({ type: 'varchar', length: 255, nullable: true })
  @Exclude()
  refreshTokenHash: string | null; // SHA-256 of the live refresh token's jti

  // Last activity tracking
  @Column({ nullable: true })
  lastLoginAt: Date;

  @Column({ nullable: true })
  lastActiveAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Computed property for verified seller badge (Tier 2 + high trust)
  get isVerifiedSeller(): boolean {
    return (
      this.verificationTier === VerificationTier.TIER_2 &&
      this.completedTransactions >= 10 &&
      this.sellerRating >= 4.5
    );
  }

  // Higher trust badge (both BVN and NIN verified)
  get hasHighTrustBadge(): boolean {
    return this.bvnVerified && this.ninVerified;
  }

  // Check if user is not banned
  get isNotBanned(): boolean {
    return !this.isBanned && (!this.banExpiresAt || this.banExpiresAt < new Date());
  }

  // Check if user can perform basic actions (Tier 0+)
  get canPerformBasicActions(): boolean {
    return this.verificationTier !== VerificationTier.NONE && this.isNotBanned;
  }

  // Check if user can sell (Tier 1+)
  get canSell(): boolean {
    return (
      (this.verificationTier === VerificationTier.TIER_1 ||
        this.verificationTier === VerificationTier.TIER_2) &&
      this.isNotBanned
    );
  }

  // Check if user has unlimited access (Tier 2)
  get hasUnlimitedAccess(): boolean {
    return this.verificationTier === VerificationTier.TIER_2 && this.isNotBanned;
  }

  // Get buying limit based on tier (in Naira)
  get buyingLimit(): number | null {
    switch (this.verificationTier) {
      case VerificationTier.NONE:
        return 0;
      case VerificationTier.TIER_0:
        return 30000;
      case VerificationTier.TIER_1:
        return 60000;
      case VerificationTier.TIER_2:
        return null; // Unlimited
      default:
        return 0;
    }
  }

  // Get selling limit based on tier (in Naira)
  get sellingLimit(): number | null {
    switch (this.verificationTier) {
      case VerificationTier.NONE:
      case VerificationTier.TIER_0:
        return 0;
      case VerificationTier.TIER_1:
        return 50000;
      case VerificationTier.TIER_2:
        return null; // Unlimited
      default:
        return 0;
    }
  }

  // Get housing listing limit based on tier (monthly rent in Naira)
  get housingListingLimit(): number | null {
    switch (this.verificationTier) {
      case VerificationTier.NONE:
      case VerificationTier.TIER_0:
        return 0;
      case VerificationTier.TIER_1:
        return 50000;
      case VerificationTier.TIER_2:
        return null; // Unlimited
      default:
        return 0;
    }
  }

  /**
   * @deprecated Use verificationTier-based checks instead
   */
  get canTransact(): boolean {
    return this.verificationTier !== VerificationTier.NONE && this.isNotBanned;
  }
}
