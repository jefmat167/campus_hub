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

/** Who put a time on the table. */
export enum ProposalParty {
  BUYER = 'buyer',
  VENDOR = 'vendor',
}

export enum ProposalStatus {
  PENDING = 'pending', // on the table, awaiting the other party
  ACCEPTED = 'accepted', // became the order's appointmentAt
  REJECTED = 'rejected', // explicitly declined (the order terminates)
  SUPERSEDED = 'superseded', // replaced by a counter-proposal
  EXPIRED = 'expired', // 48h passed / order left negotiation unanswered
}

/**
 * One proposed appointment time for a service order (rev-2 spec 03.6): the
 * buyer proposes at checkout, the vendor accepts / rejects / counters — the
 * P2P offer pattern reused, 48h expiry per proposal, 72h overall to agree.
 * The full row history is the negotiation audit trail; exactly one row is
 * PENDING at a time, and an accepted row's time becomes `appointmentAt`.
 */
@Entity('service_time_proposals')
@Index(['orderId', 'status'])
export class ServiceTimeProposal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id' })
  @Index()
  orderId: string;

  @ManyToOne(() => EscrowTransaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: EscrowTransaction;

  @Column({ type: 'varchar', length: 10 })
  proposedBy: ProposalParty;

  @Column({ type: 'timestamptz' })
  proposedTime: Date;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ type: 'varchar', length: 12, default: ProposalStatus.PENDING })
  status: ProposalStatus;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
