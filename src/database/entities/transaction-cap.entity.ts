import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { KoboColumnTransformer } from '../../common/utils/money';
import { VerificationTier } from './user.entity';

/** What kind of money-out event a cap governs. */
export enum TransactionCapType {
  /** Cumulative escrow purchase commitments (buyer side). */
  SPEND = 'spend',
  /** Cumulative wallet withdrawals. */
  WITHDRAWAL = 'withdrawal',
}

/** Rolling window a cap is measured over. */
export enum TransactionCapPeriod {
  DAILY = 'daily',
  WEEKLY = 'weekly',
}

/**
 * Per-tier cumulative / velocity transaction ceiling, editable by admins at
 * runtime (see the `wallet:manage` admin endpoints). One row per
 * (tier, capType, period). `amount` is Naira via `KoboColumnTransformer`;
 * **NULL = unlimited** (no cap enforced).
 *
 * v1 enforces only the `daily` period; `weekly` rows are supported by the
 * schema but not yet enforced.
 */
@Entity('transaction_caps')
@Index(['tier', 'capType', 'period'], { unique: true })
export class TransactionCap {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  tier: VerificationTier;

  @Column({ name: 'cap_type', type: 'varchar', length: 20 })
  capType: TransactionCapType;

  @Column({ type: 'varchar', length: 20 })
  period: TransactionCapPeriod;

  // Naira (stored as integer kobo). NULL = unlimited.
  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  amount: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
