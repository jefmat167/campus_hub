import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Faculty } from './faculty.entity';

@Entity('departments')
@Index(['facultyId', 'name'], { unique: true })
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, nullable: true })
  code: string;

  @Column({ name: 'faculty_id' })
  facultyId: string;

  @ManyToOne(() => Faculty, (faculty) => faculty.departments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'faculty_id' })
  faculty: Faculty;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
