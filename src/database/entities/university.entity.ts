import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Faculty } from './faculty.entity';

@Entity('universities')
export class University {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  @Index()
  name: string;

  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 100, nullable: true })
  state: string;

  @Column({ length: 100, nullable: true })
  city: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ length: 255, nullable: true })
  website: string;

  @Column({ type: 'enum', enum: ['federal', 'state', 'private'], default: 'federal' })
  type: 'federal' | 'state' | 'private';

  @Column({ default: true })
  isActive: boolean;

  // Cancellation policy for marketplace transactions
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 10 })
  cancellationFeePercent: number; // Default 10%

  @Column({ default: true })
  cancellationFeeEnabled: boolean;

  @OneToMany(() => Faculty, (faculty) => faculty.university)
  faculties: Faculty[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
