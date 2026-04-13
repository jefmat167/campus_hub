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
import { HousingListing } from './housing.entity';
import { User } from './user.entity';

export enum HousingReportReason {
  FAKE_LISTING = 'fake_listing',
  MISLEADING = 'misleading',
  ALREADY_TAKEN = 'already_taken',
  INAPPROPRIATE = 'inappropriate',
  OTHER = 'other',
}

@Entity('housing_reports')
@Unique('UQ_housing_reports_listing_reporter', ['listingId', 'reporterId'])
@Index(['listingId', 'createdAt'])
export class HousingReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'listing_id' })
  @Index()
  listingId: string;

  @ManyToOne(() => HousingListing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listing_id' })
  listing: HousingListing;

  @Column({ name: 'reporter_id' })
  @Index()
  reporterId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @Column({
    type: 'enum',
    enum: HousingReportReason,
  })
  reason: HousingReportReason;

  @Column({ type: 'text', nullable: true })
  details: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
