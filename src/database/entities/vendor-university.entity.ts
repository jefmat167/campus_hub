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
import { VendorProfile } from './vendor-profile.entity';
import { University } from './university.entity';

/**
 * The universities a vendor serves (marketplace rev-2 spec 03.2): 1–3 rows
 * per vendor, and the profile's home university must be one of them — both
 * invariants enforced in VendorsService, not the schema.
 */
@Entity('vendor_universities')
@Unique(['vendorProfileId', 'universityId'])
export class VendorUniversity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_profile_id' })
  @Index()
  vendorProfileId: string;

  @ManyToOne(() => VendorProfile, (profile) => profile.servedUniversities, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendor_profile_id' })
  vendorProfile: VendorProfile;

  @Column({ name: 'university_id' })
  @Index()
  universityId: string;

  @ManyToOne(() => University, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'university_id' })
  university: University;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
