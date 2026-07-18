import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('pending_uploads')
@Index(['createdAt'])
export class PendingUpload {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'object_key' })
  objectKey: string;

  // Byte size declared when the presigned URL was generated; used to reject a
  // mismatched (tampered) upload before the owning resource is created.
  @Column({ name: 'declared_size', type: 'integer', nullable: true })
  declaredSize: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
