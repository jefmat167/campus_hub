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
 * Per-university money knobs (marketplace rev-2 spec 01.3 / 04.1).
 *
 * Every settings column is nullable: NULL = "no override — use the platform
 * default". Defaults live in UniversitySettingsService (env-tunable), so a
 * university without a row (or with NULL columns) always resolves to sensible
 * values. Fees are resolved by the BUYER's university.
 */
@Entity('university_settings')
export class UniversitySettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'university_id', unique: true })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  // P2P-market platform fee % (e.g. 2.50). NULL = platform default.
  @Column({
    name: 'p2p_fee_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  p2pFeePercent: number | null;

  // Vendors'-market platform fee %. NULL = platform default.
  @Column({
    name: 'vendor_fee_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  vendorFeePercent: number | null;

  // Post-ready buyer-cancel fee % (absorbed from universities.cancellationFeePercent).
  @Column({
    name: 'cancellation_fee_percent',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  cancellationFeePercent: number | null;

  @Column({ name: 'cancellation_fee_enabled', type: 'boolean', nullable: true })
  cancellationFeeEnabled: boolean | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
