import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

@Entity('notification_preferences')
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', unique: true })
  @Index()
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // Master switches
  @Column({ default: true })
  pushEnabled: boolean;

  @Column({ default: true })
  emailEnabled: boolean;

  // Category toggles
  @Column({ default: true })
  messagesEnabled: boolean;

  @Column({ default: true })
  offersEnabled: boolean;

  @Column({ default: true })
  escrowEnabled: boolean;

  @Column({ default: true })
  reviewsEnabled: boolean;

  @Column({ default: true })
  socialEnabled: boolean;

  @Column({ default: true })
  housingEnabled: boolean;

  @Column({ default: true })
  announcementsEnabled: boolean;

  // Quiet hours
  @Column({ default: false })
  quietHoursEnabled: boolean;

  @Column({ type: 'time', nullable: true })
  quietHoursStart: string | null; // e.g., "22:00"

  @Column({ type: 'time', nullable: true })
  quietHoursEnd: string | null; // e.g., "07:00"

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
