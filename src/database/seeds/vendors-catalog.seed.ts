import { DataSource } from 'typeorm';
import { University } from '../entities/university.entity';
import { Faculty } from '../entities/faculty.entity';
import { Department } from '../entities/department.entity';
import {
  User,
  VerificationTier,
  AccountType,
} from '../entities/user.entity';
import { Wallet, WalletTransaction } from '../entities/wallet.entity';
import {
  VendorProfile,
  VendorStatus,
} from '../entities/vendor-profile.entity';
import { VendorUniversity } from '../entities/vendor-university.entity';
import {
  VendorListing,
  VendorListingImage,
  VendorListingType,
  VendorListingStatus,
} from '../entities/vendor-listing.entity';
import {
  VendorOptionGroup,
  VendorOption,
  OptionSelectionType,
} from '../entities/vendor-option.entity';
import { VendorListingFulfillment } from '../entities/vendor-listing-fulfillment.entity';
import { ListingCategory } from '../entities/listing.entity';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const databaseUrl = process.env.DATABASE_URL;

const dataSource = new DataSource({
  type: 'postgres',
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'campus_hub',
      }),
  entities: [
    University,
    Faculty,
    Department,
    User,
    Wallet,
    WalletTransaction,
    VendorProfile,
    VendorUniversity,
    VendorListing,
    VendorListingImage,
    VendorOptionGroup,
    VendorOption,
    VendorListingFulfillment,
  ],
  synchronize: false,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

const VENDOR_PASSWORD = 'VendorPass123!';

interface SeedOption {
  name: string;
  priceDelta?: number;
  stock?: number | null;
}

interface SeedGroup {
  name: string;
  selectionType: OptionSelectionType;
  required: boolean;
  options: SeedOption[];
}

interface SeedListing {
  type: VendorListingType;
  title: string;
  description: string;
  category: ListingCategory;
  basePrice: number;
  stock?: number | null; // goods only; omit/null = untracked (forces manual confirm)
  manualConfirm?: boolean;
  deliveryEnabled?: boolean; // for goods: door delivery; for services: travel
  deliveryFee?: number;
  groups?: SeedGroup[];
}

interface SeedVendor {
  businessName: string;
  email: string;
  phone: string;
  description: string;
  shopAddress: string;
  servesNeighbor: boolean; // also serve the second seeded university
  listings: SeedListing[];
}

// 3 vendors with distinct shapes: tracked-stock food (auto-confirm + options),
// untracked made-to-order goods (manual confirm), and services (bookings).
const VENDORS: SeedVendor[] = [
  {
    businessName: 'Mama T Kitchen',
    email: 'mamat.vendor@seed.campushub.ng',
    phone: '08030000201',
    description:
      'Home-style Nigerian meals cooked fresh daily — jollof, fried rice, swallow and soups.',
    shopAddress: 'Shop 4, Mama T Plaza, beside the ICT gate',
    servesNeighbor: true,
    listings: [
      {
        type: VendorListingType.GOODS,
        title: 'Jollof Rice & Chicken',
        description:
          'Smoky party-style jollof with a grilled chicken lap. Cooked fresh every morning.',
        category: ListingCategory.FOOD,
        basePrice: 2500,
        stock: 40,
        manualConfirm: false,
        deliveryEnabled: true,
        deliveryFee: 500,
        groups: [
          {
            name: 'Size',
            selectionType: OptionSelectionType.SINGLE,
            required: true,
            options: [
              { name: 'Regular' },
              { name: 'Large', priceDelta: 700 },
            ],
          },
          {
            name: 'Extras',
            selectionType: OptionSelectionType.MULTI,
            required: false,
            options: [
              { name: 'Extra chicken', priceDelta: 900, stock: 15 },
              { name: 'Fried plantain', priceDelta: 400 },
              { name: 'Coleslaw', priceDelta: 300 },
            ],
          },
        ],
      },
      {
        type: VendorListingType.GOODS,
        title: 'Fried Rice Combo',
        description:
          'Fried rice with peppered beef and a chilled soft drink. Lunch sorted.',
        category: ListingCategory.FOOD,
        basePrice: 2200,
        stock: 30,
        manualConfirm: false,
        deliveryEnabled: true,
        deliveryFee: 500,
      },
    ],
  },
  {
    businessName: 'Campus Prints & Branding',
    email: 'campusprints.vendor@seed.campushub.ng',
    phone: '08030000202',
    description:
      'Custom shirts, mugs, project binding and large-format printing for students and departments.',
    shopAddress: 'Suite 12, Works Road Arcade',
    servesNeighbor: false,
    listings: [
      {
        type: VendorListingType.GOODS,
        title: 'Custom Printed T-Shirt',
        description:
          'Your design printed on a quality cotton tee. Made to order — confirm your design before we print.',
        category: ListingCategory.CLOTHING,
        basePrice: 4500,
        stock: null, // untracked → manual confirmation forced
        manualConfirm: true,
        deliveryEnabled: true,
        deliveryFee: 800,
        groups: [
          {
            name: 'Shirt size',
            selectionType: OptionSelectionType.SINGLE,
            required: true,
            options: [
              { name: 'S' },
              { name: 'M' },
              { name: 'L' },
              { name: 'XL', priceDelta: 300 },
            ],
          },
        ],
      },
      {
        type: VendorListingType.GOODS,
        title: 'Project Binding (Hard Cover)',
        description:
          'Gold-embossed hard-cover binding for final-year projects. Ready in 24 hours.',
        category: ListingCategory.OTHER,
        basePrice: 3500,
        stock: null,
        manualConfirm: true,
        deliveryEnabled: false,
      },
    ],
  },
  {
    businessName: 'GlowTouch Beauty',
    email: 'glowtouch.vendor@seed.campushub.ng',
    phone: '08030000203',
    description:
      'Braids, wig installs, nails and makeup — in the studio or we come to your hostel.',
    shopAddress: 'Suite 2, Beauty Arcade, North Gate',
    servesNeighbor: true,
    listings: [
      {
        type: VendorListingType.SERVICE,
        title: 'Knotless Braids (Mid-Back)',
        description:
          'Professional knotless braids, extensions included. Book a time — about 4 hours.',
        category: ListingCategory.BEAUTY,
        basePrice: 8000,
        deliveryEnabled: true, // travel: we come to you
        deliveryFee: 1500,
        groups: [
          {
            name: 'Length',
            selectionType: OptionSelectionType.SINGLE,
            required: true,
            options: [
              { name: 'Mid-back' },
              { name: 'Waist length', priceDelta: 2000 },
            ],
          },
        ],
      },
      {
        type: VendorListingType.SERVICE,
        title: 'Event Makeup',
        description:
          'Full-glam or natural event makeup. Book your slot ahead of dinners and convocations.',
        category: ListingCategory.BEAUTY,
        basePrice: 6000,
        deliveryEnabled: true,
        deliveryFee: 1000,
      },
    ],
  },
];

async function seed() {
  console.log('Connecting to database...');
  await dataSource.initialize();
  console.log('Connected successfully!');

  const universityRepo = dataSource.getRepository(University);
  const userRepo = dataSource.getRepository(User);
  const walletRepo = dataSource.getRepository(Wallet);
  const profileRepo = dataSource.getRepository(VendorProfile);
  const vendorUniversityRepo = dataSource.getRepository(VendorUniversity);
  const listingRepo = dataSource.getRepository(VendorListing);
  const groupRepo = dataSource.getRepository(VendorOptionGroup);
  const optionRepo = dataSource.getRepository(VendorOption);
  const fulfillmentRepo = dataSource.getRepository(VendorListingFulfillment);

  const universities = await universityRepo.find({
    where: { isActive: true },
    order: { name: 'ASC' },
    take: 2,
  });
  if (universities.length === 0) {
    console.error('No active universities found — run `npm run seed` first.');
    await dataSource.destroy();
    process.exit(1);
  }
  const homeUni = universities[0];
  const neighborUni = universities[1] ?? null;
  console.log(`Home university: ${homeUni.name}`);
  if (neighborUni) console.log(`Neighbor university: ${neighborUni.name}`);

  const passwordHash = await bcrypt.hash(VENDOR_PASSWORD, 12);
  let vendorCount = 0;
  let listingCount = 0;

  for (const seedVendor of VENDORS) {
    const existing = await userRepo.findOne({
      where: { email: seedVendor.email },
    });
    if (existing) {
      console.log(`Skipping ${seedVendor.businessName} (already seeded)`);
      continue;
    }

    // Vendor-only account (rev-2 spec 01.5): no student identity.
    const user = await userRepo.save(
      userRepo.create({
        email: seedVendor.email,
        phone: seedVendor.phone,
        fullName: seedVendor.businessName,
        gender: null,
        universityId: null,
        facultyId: null,
        departmentId: null,
        accountType: AccountType.VENDOR,
        verificationTier: VerificationTier.NONE,
        passwordHash,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
      }),
    );
    await walletRepo.save(walletRepo.create({ userId: user.id, balance: 0 }));

    const profile = await profileRepo.save(
      profileRepo.create({
        userId: user.id,
        businessName: seedVendor.businessName,
        description: seedVendor.description,
        homeUniversityId: homeUni.id,
        shopAddress: seedVendor.shopAddress,
        status: VendorStatus.ACTIVE,
        shopfrontPhotoUrl: 'https://cdn.example.com/seed-shopfront.jpg',
        photoCapturedLive: true,
        submittedAt: new Date(),
        reviewedAt: new Date(),
        reviewedBy: 'seed-script',
      }),
    );

    const servedIds = [homeUni.id];
    if (seedVendor.servesNeighbor && neighborUni) servedIds.push(neighborUni.id);
    for (const universityId of servedIds) {
      await vendorUniversityRepo.save(
        vendorUniversityRepo.create({ vendorProfileId: profile.id, universityId }),
      );
    }

    for (const seedListing of seedVendor.listings) {
      const isService = seedListing.type === VendorListingType.SERVICE;
      const listing = await listingRepo.save(
        listingRepo.create({
          vendorProfileId: profile.id,
          type: seedListing.type,
          title: seedListing.title,
          description: seedListing.description,
          category: seedListing.category,
          basePrice: seedListing.basePrice,
          stock: isService ? null : seedListing.stock ?? null,
          // Services + untracked goods are always manual (rev-2 03.5).
          manualConfirm:
            isService || seedListing.stock == null
              ? true
              : seedListing.manualConfirm ?? false,
          status: VendorListingStatus.ACTIVE,
        }),
      );
      listingCount++;

      let groupPosition = 0;
      for (const seedGroup of seedListing.groups ?? []) {
        const group = await groupRepo.save(
          groupRepo.create({
            vendorListingId: listing.id,
            name: seedGroup.name,
            selectionType: seedGroup.selectionType,
            required: seedGroup.required,
            position: groupPosition++,
          }),
        );
        let optionPosition = 0;
        for (const seedOption of seedGroup.options) {
          await optionRepo.save(
            optionRepo.create({
              optionGroupId: group.id,
              name: seedOption.name,
              priceDelta: seedOption.priceDelta ?? 0,
              stock: seedOption.stock ?? null,
              position: optionPosition++,
            }),
          );
        }
      }

      // One fulfillment row per served university (delivery/travel opt-in).
      for (const universityId of servedIds) {
        await fulfillmentRepo.save(
          fulfillmentRepo.create({
            vendorListingId: listing.id,
            universityId,
            deliveryEnabled: seedListing.deliveryEnabled ?? false,
            deliveryFee: seedListing.deliveryEnabled
              ? seedListing.deliveryFee ?? 0
              : null,
          }),
        );
      }
    }

    vendorCount++;
    console.log(
      `Seeded: ${seedVendor.businessName} (${seedVendor.listings.length} listings, serves ${servedIds.length} campus(es))`,
    );
  }

  console.log('\n========== Vendor Seed Complete ==========');
  console.log(`Vendors: ${vendorCount} (all ACTIVE, login password: ${VENDOR_PASSWORD})`);
  console.log(`Listings: ${listingCount}`);
  console.log('===========================================\n');

  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
