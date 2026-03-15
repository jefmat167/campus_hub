import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';

export enum PlatformTransactionType {
  ESCROW_FEE = 'escrow_fee',
  CANCELLATION_FEE = 'cancellation_fee',
}

@Entity('platform_wallet')
export class PlatformWallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  balance: number;

  @OneToMany(
    () => PlatformWalletTransaction,
    (transaction) => transaction.platformWallet,
  )
  transactions: PlatformWalletTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('platform_wallet_transactions')
@Index(['createdAt'])
@Index(['type'])
export class PlatformWalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'platform_wallet_id' })
  @Index()
  platformWalletId: string;

  @ManyToOne(() => PlatformWallet, (wallet) => wallet.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'platform_wallet_id' })
  platformWallet: PlatformWallet;

  @Column({
    type: 'enum',
    enum: PlatformTransactionType,
  })
  type: PlatformTransactionType;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount: number;

  @Column({ length: 100, unique: true })
  @Index()
  reference: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'escrow_id', type: 'uuid', nullable: true })
  escrowId: string | null;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  balanceBefore: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  balanceAfter: number;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
