import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { University } from './university.entity';
import { Department } from './department.entity';

@Entity('faculties')
@Index(['universityId', 'name'], { unique: true })
export class Faculty {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ length: 50, nullable: true })
  code: string;

  @Column({ name: 'university_id' })
  universityId: string;

  @ManyToOne(() => University, (university) => university.faculties, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @OneToMany(() => Department, (department) => department.faculty)
  departments: Department[];

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
