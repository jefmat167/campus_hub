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
import { University } from './university.entity';

/**
 * Admin-curated public handover locations per university (marketplace rev-2
 * spec 04.1) — "main gate", "hostel block A", etc.
 *
 * Used by vendor delivery: the mandatory destination for neighboring-university
 * delivery, and an optional alternative to a full address for home-university
 * delivery. Deactivated points stay referenced by historical orders (the order
 * snapshots the name), so rows are soft-disabled via isActive, never deleted.
 */
@Entity('drop_points')
@Index(['universityId', 'isActive'])
export class DropPoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @Column({ length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  directions: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
