import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { VendorListing } from './vendor-listing.entity';
import { KoboColumnTransformer } from '../../common/utils/money';

export enum OptionSelectionType {
  SINGLE = 'single',
  MULTI = 'multi',
}

/**
 * Variants AND add-ons through one mechanism (rev-2 spec 03.3, FIG 03.2):
 * a group has a name, a selection rule (single/multi), and a required flag.
 * "Size" = single-select + required; "Extras" = multi-select + optional.
 */
@Entity('option_groups')
@Index(['vendorListingId', 'position'])
export class VendorOptionGroup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'vendor_listing_id' })
  vendorListingId: string;

  @ManyToOne(() => VendorListing, (listing) => listing.optionGroups, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'vendor_listing_id' })
  vendorListing: VendorListing;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 10 })
  selectionType: OptionSelectionType;

  @Column({ default: false })
  required: boolean;

  @Column({ type: 'int', default: 0 })
  position: number;

  @OneToMany(() => VendorOption, (option) => option.optionGroup)
  options: VendorOption[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}

/**
 * One choice inside a group. Can carry its own price delta, its own stock,
 * both, or neither — "extra chicken" can sell out independently while the
 * rest of the order proceeds (spec 03.3).
 */
@Entity('options')
@Index(['optionGroupId', 'position'])
export class VendorOption {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'option_group_id' })
  optionGroupId: string;

  @ManyToOne(() => VendorOptionGroup, (group) => group.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'option_group_id' })
  optionGroup: VendorOptionGroup;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'bigint', default: 0, transformer: KoboColumnTransformer })
  priceDelta: number;

  // NULL = untracked; 0 = sold out.
  @Column({ type: 'int', nullable: true })
  stock: number | null;

  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
