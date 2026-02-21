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
import { Faculty } from './faculty.entity';
import { Department } from './department.entity';
import { ListingCategory, VisibilityScope } from './listing.entity';

export enum RequestUrgency {
  ASAP = 'asap',
  WITHIN_A_WEEK = 'within_a_week',
  FLEXIBLE = 'flexible',
}

export enum BuyRequestStatus {
  OPEN = 'open',
  FULFILLED = 'fulfilled',
  CANCELLED = 'cancelled',
}

@Entity('buy_requests')
@Index(['universityId', 'status', 'createdAt'])
@Index(['universityId', 'category', 'status'])
@Index(['requesterId', 'status'])
export class BuyRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'requester_id' })
  @Index()
  requesterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requester_id' })
  requester: User;

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
    enum: ListingCategory,
  })
  @Index()
  category: ListingCategory;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'budget_min' })
  budgetMin: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    name: 'budget_max',
  })
  budgetMax: number | null;

  @Column({ default: true, name: 'is_budget_negotiable' })
  isBudgetNegotiable: boolean;

  @Column({
    type: 'enum',
    enum: RequestUrgency,
    default: RequestUrgency.FLEXIBLE,
  })
  urgency: RequestUrgency;

  @Column({
    type: 'enum',
    enum: VisibilityScope,
    default: VisibilityScope.UNIVERSITY,
    name: 'visibility_scope',
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

  @Column({
    type: 'enum',
    enum: BuyRequestStatus,
    default: BuyRequestStatus.OPEN,
  })
  @Index()
  status: BuyRequestStatus;

  @Column({ default: 0, name: 'view_count' })
  viewCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
