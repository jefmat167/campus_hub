import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
  ManyToOne,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

export enum WalletTransactionType {
  DEPOSIT = 'deposit',
  WITHDRAWAL = 'withdrawal',
  ESCROW_HOLD = 'escrow_hold',
  ESCROW_RELEASE = 'escrow_release',
  ESCROW_REFUND = 'escrow_refund',
  FEE = 'fee',
  CHARGEBACK = 'chargeback', // deposit clawed back after a card dispute/refund
}

export enum WalletTransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  @Index()
  userId: string;

  // RESTRICT: a user with a wallet (financial history) must not be hard-deleted.
  @OneToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
  balance: number;

  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
  lockedBalance: number; // Funds in escrow

  @Column({ default: false })
  isLocked: boolean; // For security freeze

  @Column({ type: 'text', nullable: true })
  lockReason: string;

  @Column({ nullable: true })
  lockedAt: Date;

  // Bank account details for withdrawals
  @Column({ length: 20, nullable: true })
  bankAccountNumber: string;

  @Column({ length: 20, nullable: true })
  bankCode: string;

  @Column({ length: 100, nullable: true })
  bankName: string;

  @Column({ length: 255, nullable: true })
  bankAccountName: string;

  // Paystack recipient code for transfers
  @Column({ length: 100, nullable: true })
  paystackRecipientCode: string;

  @OneToMany(() => WalletTransaction, (transaction) => transaction.wallet)
  transactions: WalletTransaction[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Available balance (total - locked)
  get availableBalance(): number {
    return Number(this.balance) - Number(this.lockedBalance);
  }
}

@Entity('wallet_transactions')
@Index(['walletId', 'createdAt'])
@Index(['reference', 'status'])
export class WalletTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_id' })
  @Index()
  walletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.transactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'wallet_id' })
  wallet: Wallet;

  @Column({
    type: 'enum',
    enum: WalletTransactionType,
  })
  type: WalletTransactionType;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  amount: number;

  @Column({
    type: 'enum',
    enum: WalletTransactionStatus,
    default: WalletTransactionStatus.PENDING,
  })
  status: WalletTransactionStatus;

  @Column({ length: 100, unique: true })
  @Index()
  reference: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // For linking to escrow or payment gateway
  @Column({ length: 255, nullable: true })
  externalReference: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  // Which market produced this row ('p2p' | 'vendor'; rev-2 spec 01.1) —
  // lets a student-vendor filter their history down to business income.
  @Column({ type: 'varchar', length: 10, nullable: true })
  @Index()
  market: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  balanceBefore: number;

  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  balanceAfter: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
