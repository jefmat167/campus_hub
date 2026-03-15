import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { EscrowTransaction } from './escrow.entity';

@Entity('delivery_codes')
@Index(['escrowId'])
@Index(['code', 'isUsed'])
export class DeliveryCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'escrow_id' })
  @Index()
  escrowId: string;

  @ManyToOne(() => EscrowTransaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'escrow_id' })
  escrow: EscrowTransaction;

  @Column({ type: 'varchar', length: 4 })
  code: string;

  @Column({ type: 'timestamp' })
  validFrom: Date;

  @Column({ type: 'timestamp' })
  validUntil: Date;

  @Column({ default: false })
  isUsed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @Column({ default: false })
  isInvalidated: boolean;

  @Column({ type: 'timestamp', nullable: true })
  invalidatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  /**
   * Check if the code is currently valid (within time window and not used/invalidated)
   */
  get isValid(): boolean {
    const now = new Date();
    return (
      !this.isUsed &&
      !this.isInvalidated &&
      now >= this.validFrom &&
      now <= this.validUntil
    );
  }

  /**
   * Check if the code has expired (past validity window)
   */
  get isExpired(): boolean {
    return new Date() > this.validUntil;
  }

  /**
   * Check if the code is not yet valid (before validity window)
   */
  get isNotYetValid(): boolean {
    return new Date() < this.validFrom;
  }
}
