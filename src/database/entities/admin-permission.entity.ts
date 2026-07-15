import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Admin } from './admin.entity';

@Entity('admin_permissions')
@Unique(['adminId', 'permission'])
@Index(['adminId'])
export class AdminPermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'admin_id' })
  adminId: string;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_id' })
  admin: Admin;

  @Column({ type: 'varchar', length: 50 })
  permission: string;

  @Column({ name: 'granted_by' })
  grantedBy: string;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'granted_by' })
  grantedByAdmin: Admin;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
