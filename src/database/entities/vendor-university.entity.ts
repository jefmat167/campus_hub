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
  Unique,
} from 'typeorm';
import { VendorProfile } from './vendor-profile.entity';
import { University } from './university.entity';
import { VendorDeliveryPoint } from './vendor-delivery-point.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

/**
 * The universities a vendor serves (marketplace rev-2 spec 03.2): 1–3 rows
 * per vendor, and the profile's home university must be one of them — both
 * invariants enforced in VendorsService, not the schema.
 *
 * Since the 2026-09-21 amendment the row is also the vendor's DELIVERY PRESET
 * for that campus, inherited by every listing (listings only opt out via
 * `pickupOnly`):
 *   - `doorDeliveryFee`  — goods to the student's own address; HOME campus
 *                          only (service-enforced NULL elsewhere). NULL = no
 *                          door delivery, 0 = free.
 *   - `serviceTravelFee` — the vendor travels to a student-supplied address
 *                          for services; any served campus. NULL = at-shop only.
 *   - `deliveryPoints`   — the admin drop points the vendor delivers goods to
 *                          on this campus, each with its own fee.
 * "Delivery available" is derived, never stored: (home && door fee not null)
 * OR at least one active delivery point.
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

  // Kobo in the column, naira on the property (KoboColumnTransformer).
  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  doorDeliveryFee: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: KoboColumnTransformer })
  serviceTravelFee: number | null;

  @OneToMany(() => VendorDeliveryPoint, (point) => point.vendorUniversity)
  deliveryPoints: VendorDeliveryPoint[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
