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
import { VendorUniversity } from './vendor-university.entity';
import { DropPoint } from './drop-point.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

/**
 * One admin drop point a vendor delivers to on a served campus, with the
 * vendor's fee for that point (2026-09-21 amendment to spec 03.2: delivery is
 * a per-vendor per-campus PRESET, not a per-listing field). Hangs off the
 * VendorUniversity row so dropping a served campus takes its points with it
 * (CASCADE). Vendors only ever pick from the admin-curated `drop_points` of
 * that campus — never define their own; ≤ 3 per campus, active at save time
 * (service-enforced). Orders snapshot the point's name, so a point retired by
 * admins later is simply filtered out at read time.
 */
@Entity('vendor_delivery_points')
@Unique(['vendorUniversityId', 'dropPointId'])
export class VendorDeliveryPoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_university_id' })
  @Index()
  vendorUniversityId: string;

  @ManyToOne(() => VendorUniversity, (vu) => vu.deliveryPoints, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendor_university_id' })
  vendorUniversity: VendorUniversity;

  @Column({ name: 'drop_point_id' })
  dropPointId: string;

  @ManyToOne(() => DropPoint, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'drop_point_id' })
  dropPoint: DropPoint;

  // Delivery fee to this point in kobo (0 = free). Passes through to the
  // vendor in full — the platform fee is charged on the items subtotal only.
  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
  fee: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
