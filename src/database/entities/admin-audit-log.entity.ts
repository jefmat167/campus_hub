import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Admin } from './admin.entity';

export enum AuditAction {
  USER_ROLE_CHANGE = 'user_role_change',
  USER_BAN = 'user_ban',
  USER_UNBAN = 'user_unban',
  USER_TIER_CHANGE = 'user_tier_change',
  USER_FORCE_LOGOUT = 'user_force_logout',
  WALLET_CREDIT = 'wallet_credit',
  WALLET_DEBIT = 'wallet_debit',
  LISTING_TAKEDOWN = 'listing_takedown',
  POST_HIDE = 'post_hide',
  POST_UNHIDE = 'post_unhide',
  COMMENT_DELETE = 'comment_delete',
  UNIVERSITY_CREATE = 'university_create',
  UNIVERSITY_UPDATE = 'university_update',
  UNIVERSITY_DEACTIVATE = 'university_deactivate',
  UNIVERSITY_ACTIVATE = 'university_activate',
  FACULTY_CREATE = 'faculty_create',
  FACULTY_UPDATE = 'faculty_update',
  FACULTY_DEACTIVATE = 'faculty_deactivate',
  FACULTY_ACTIVATE = 'faculty_activate',
  DEPARTMENT_CREATE = 'department_create',
  DEPARTMENT_UPDATE = 'department_update',
  DEPARTMENT_DEACTIVATE = 'department_deactivate',
  DEPARTMENT_ACTIVATE = 'department_activate',
  HOUSING_TAKEDOWN = 'housing_takedown',
  REPORT_REVIEW = 'report_review',
  APPEAL_REVIEW = 'appeal_review',
  ADMIN_CREATE = 'admin_create',
  ADMIN_PERMISSION_GRANT = 'admin_permission_grant',
  ADMIN_PERMISSION_REVOKE = 'admin_permission_revoke',
  ADMIN_DEACTIVATE = 'admin_deactivate',
  TRANSACTION_CAP_UPDATE = 'transaction_cap_update',
  UNIVERSITY_SETTINGS_UPDATE = 'university_settings_update',
  DROP_POINT_CREATE = 'drop_point_create',
  DROP_POINT_UPDATE = 'drop_point_update',
}

export enum AuditTargetType {
  USER = 'user',
  LISTING = 'listing',
  POST = 'post',
  COMMENT = 'comment',
  HOUSING_LISTING = 'housing_listing',
  UNIVERSITY = 'university',
  FACULTY = 'faculty',
  DEPARTMENT = 'department',
  WALLET = 'wallet',
  ESCROW = 'escrow',
  REPORT = 'report',
  APPEAL = 'appeal',
  ADMIN = 'admin',
}

@Entity('admin_audit_logs')
@Index(['adminId', 'createdAt'])
@Index(['targetType', 'targetId'])
@Index(['action', 'createdAt'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'admin_id' })
  @Index()
  adminId: string;

  @ManyToOne(() => Admin, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'admin_id' })
  admin: Admin;

  @Column({ type: 'enum', enum: AuditAction })
  action: AuditAction;

  @Column({ type: 'enum', enum: AuditTargetType, name: 'target_type' })
  targetType: AuditTargetType;

  @Column({ name: 'target_id' })
  targetId: string;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
