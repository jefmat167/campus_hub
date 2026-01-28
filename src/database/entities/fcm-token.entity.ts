import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';

export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

@Entity('fcm_tokens')
@Unique(['token'])
@Index(['userId', 'isActive'])
export class FcmToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ length: 500 })
  @Index()
  token: string;

  @Column({
    type: 'enum',
    enum: DevicePlatform,
  })
  platform: DevicePlatform;

  // Device identifier for managing multiple devices
  @Column({ type: 'varchar', length: 255, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  deviceName: string | null;

  @Column({ default: true })
  @Index()
  isActive: boolean;

  // Track last successful push
  @Column({ type: 'timestamp', nullable: true })
  lastUsedAt: Date | null;

  // Track failures for cleanup
  @Column({ default: 0 })
  failureCount: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
