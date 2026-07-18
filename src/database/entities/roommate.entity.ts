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
import { KoboColumnTransformer } from '../../common/utils/money';
import { User, Gender } from './user.entity';

// Re-exported for existing importers (seeds, roommate DTOs); canonical
// definition now lives on the User entity.
export { Gender };
import { University } from './university.entity';

export enum CleanlinessLevel {
  VERY_CLEAN = 'very_clean',
  CLEAN = 'clean',
  MODERATE = 'moderate',
  RELAXED = 'relaxed',
}

export enum NoiseLevel {
  VERY_QUIET = 'very_quiet',
  QUIET = 'quiet',
  MODERATE = 'moderate',
  SOCIAL = 'social',
}

export enum SleepSchedule {
  EARLY_BIRD = 'early_bird', // Sleep before 10pm
  NORMAL = 'normal', // Sleep 10pm-12am
  NIGHT_OWL = 'night_owl', // Sleep after 12am
  FLEXIBLE = 'flexible',
}

export enum StudyHabit {
  QUIET_STUDIER = 'quiet_studier', // Studies in silence
  BACKGROUND_NOISE = 'background_noise', // Needs music/TV
  LIBRARY_STUDIER = 'library_studier', // Studies outside
  FLEXIBLE = 'flexible',
}

export enum RoommateProfileStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  MATCHED = 'matched',
  DELETED = 'deleted',
}

@Entity('roommate_profiles')
@Index(['universityId', 'status'])
@Index(['gender', 'status'])
@Index(['budgetMin', 'budgetMax'])
export class RoommateProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  @Index()
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @Column({
    type: 'enum',
    enum: RoommateProfileStatus,
    default: RoommateProfileStatus.ACTIVE,
  })
  @Index()
  status: RoommateProfileStatus;

  // Personal info
  @Column({
    type: 'enum',
    enum: Gender,
  })
  gender: Gender;

  @Column({ type: 'int' })
  age: number;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  // Budget
  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  budgetMin: number;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  budgetMax: number;

  // Preferred area/location
  @Column({ type: 'jsonb', default: [] })
  preferredAreas: string[];

  // Move-in timeline
  @Column({ type: 'date', nullable: true })
  moveInDate: Date | null;

  @Column({ default: false })
  moveInFlexible: boolean;

  // Living habits
  @Column({
    type: 'enum',
    enum: CleanlinessLevel,
    default: CleanlinessLevel.CLEAN,
  })
  cleanliness: CleanlinessLevel;

  @Column({
    type: 'enum',
    enum: NoiseLevel,
    default: NoiseLevel.MODERATE,
  })
  noiseLevel: NoiseLevel;

  @Column({
    type: 'enum',
    enum: SleepSchedule,
    default: SleepSchedule.NORMAL,
  })
  sleepSchedule: SleepSchedule;

  @Column({
    type: 'enum',
    enum: StudyHabit,
    default: StudyHabit.FLEXIBLE,
  })
  studyHabit: StudyHabit;

  @Column({ default: false })
  smokes: boolean;

  @Column({ default: false })
  drinks: boolean;

  @Column({ default: false })
  hasPets: boolean;

  @Column({ default: false })
  allowsVisitors: boolean;

  // Preferences for roommate
  @Column({
    type: 'enum',
    enum: Gender,
    nullable: true,
  })
  preferredGender: Gender | null; // null = no preference

  @Column({ type: 'int', nullable: true })
  preferredAgeMin: number | null;

  @Column({ type: 'int', nullable: true })
  preferredAgeMax: number | null;

  @Column({
    type: 'enum',
    enum: CleanlinessLevel,
    nullable: true,
  })
  preferredCleanliness: CleanlinessLevel | null;

  @Column({
    type: 'enum',
    enum: NoiseLevel,
    nullable: true,
  })
  preferredNoiseLevel: NoiseLevel | null;

  @Column({
    type: 'enum',
    enum: SleepSchedule,
    nullable: true,
  })
  preferredSleepSchedule: SleepSchedule | null;

  @Column({ default: false })
  nonSmokerOnly: boolean;

  @Column({ default: false })
  nonDrinkerOnly: boolean;

  @Column({ default: false })
  noPetsAllowed: boolean;

  // Additional info
  @Column({ type: 'jsonb', nullable: true })
  interests: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  languages: string[] | null;

  // Stats
  @Column({ default: 0 })
  viewCount: number;

  @Column({ default: 0 })
  interestReceivedCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// Entity for tracking roommate interest/matches
@Entity('roommate_interests')
@Index(['fromUserId', 'toUserId'], { unique: true })
@Index(['toUserId', 'status'])
@Index(['fromUserId', 'status'])
export class RoommateInterest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'from_user_id' })
  @Index()
  fromUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_user_id' })
  fromUser: User;

  @Column({ name: 'to_user_id' })
  @Index()
  toUserId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_user_id' })
  toUser: User;

  @Column({
    type: 'enum',
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending',
  })
  status: 'pending' | 'accepted' | 'declined';

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  compatibilityScore: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
