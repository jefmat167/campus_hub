import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { EscrowTransaction } from './escrow.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

/**
 * One checkout = one wallet debit split into one independent sub-order
 * (EscrowTransaction) per seller (rev-2 spec 01.6 / 03.4).
 *
 * Deliberately a thin grouping row, not a state machine: checkout is
 * all-or-nothing inside one DB transaction, so this row only exists for
 * successful checkouts. Sub-order settlements/refunds draw from the single
 * `walletReference` hold (`CHECKOUT_<id>`); the invariant Σ sub-order
 * amounts = total is established at creation.
 */
@Entity('checkouts')
export class Checkout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'buyer_id' })
  @Index()
  buyerId: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'buyer_id' })
  buyer: User;

  // Buyer's university at checkout time (fee-resolution audit snapshot).
  @Column({ name: 'university_id', type: 'uuid', nullable: true })
  universityId: string | null;

  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  itemsSubtotal: number;

  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
  deliveryFeeTotal: number;

  // Everything the buyer pays — the tier buy-cap and the wallet hold apply here.
  @Column({ type: 'bigint', transformer: KoboColumnTransformer })
  total: number;

  // The single lockFunds reference: CHECKOUT_<id>.
  @Column({ type: 'varchar', length: 100, unique: true })
  walletReference: string;

  @OneToMany(() => EscrowTransaction, (order) => order.checkout)
  orders: EscrowTransaction[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
