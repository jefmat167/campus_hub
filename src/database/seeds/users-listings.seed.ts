import { DataSource } from 'typeorm';
import { University } from '../entities/university.entity';
import { Faculty } from '../entities/faculty.entity';
import { Department } from '../entities/department.entity';
import { User, VerificationTier, Tier1ReviewStatus, YearOfStudy } from '../entities/user.entity';
import { Wallet, WalletTransaction } from '../entities/wallet.entity';
import {
  Listing,
  ListingImage,
  ListingCategory,
  ListingCondition,
  VisibilityScope,
  DeliveryOption,
  ListingStatus,
  ListingType,
} from '../entities/listing.entity';
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
  entities: [University, Faculty, Department, User, Wallet, WalletTransaction, Listing, ListingImage],
  synchronize: false,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

// Helper functions
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generatePhone(): string {
  const prefixes = ['0803', '0805', '0806', '0807', '0808', '0809', '0810', '0813', '0814', '0816', '0903', '0906'];
  return randomElement(prefixes) + String(randomInt(1000000, 9999999));
}

// Listing templates by category
const listingTemplates: Record<ListingCategory, { titles: string[]; descriptions: string[] }> = {
  [ListingCategory.ELECTRONICS]: {
    titles: [
      'Wireless Bluetooth Earbuds',
      'Portable Power Bank 20000mAh',
      'USB-C Hub Adapter',
    ],
    descriptions: [
      'High-quality wireless earbuds with noise cancellation. Perfect for studying and commuting.',
      'Fast-charging power bank with multiple ports. Keeps your devices charged all day.',
      'Multi-port USB-C hub for laptops. HDMI, USB 3.0, and SD card slots included.',
    ],
  },
  [ListingCategory.BOOKS]: {
    titles: [
      'Engineering Mathematics Textbook',
      'Introduction to Programming (Python)',
      'Organic Chemistry Handbook',
    ],
    descriptions: [
      'Comprehensive engineering mathematics textbook. Covers calculus, linear algebra, and more.',
      'Learn Python programming from scratch. Great for beginners and CS students.',
      'Complete organic chemistry reference guide. Perfect for pharmacy and chemistry students.',
    ],
  },
  [ListingCategory.LAPTOPS]: {
    titles: [
      'HP Pavilion 15 Laptop',
      'Dell Inspiron 14 Notebook',
      'Lenovo ThinkPad X1 Carbon',
    ],
    descriptions: [
      'HP Pavilion with Intel Core i5, 8GB RAM, 256GB SSD. Great for students.',
      'Dell Inspiron with AMD Ryzen 5, 8GB RAM, 512GB SSD. Lightweight and portable.',
      'Premium ThinkPad with excellent keyboard. Perfect for coding and office work.',
    ],
  },
  [ListingCategory.PHONES]: {
    titles: [
      'iPhone 12 Pro Max 128GB',
      'Samsung Galaxy A54 5G',
      'Redmi Note 12 Pro',
    ],
    descriptions: [
      'iPhone 12 Pro Max in excellent condition. Comes with charger and case.',
      'Samsung Galaxy A54 with great camera. 6 months old, still under warranty.',
      'Redmi Note 12 Pro with 108MP camera. Fast charging and long battery life.',
    ],
  },
  [ListingCategory.FURNITURE]: {
    titles: [
      'Study Desk with Drawers',
      'Ergonomic Office Chair',
      'Wooden Bookshelf (3 Tier)',
    ],
    descriptions: [
      'Sturdy study desk with two drawers. Perfect for hostel room or apartment.',
      'Comfortable office chair with lumbar support. Adjustable height and armrests.',
      'Wooden bookshelf with 3 tiers. Great for organizing books and stationery.',
    ],
  },
  [ListingCategory.CLOTHING]: {
    titles: [
      'Vintage Denim Jacket (Size M)',
      'Nike Air Force 1 (Size 42)',
      'Formal Blazer (Navy Blue)',
    ],
    descriptions: [
      'Classic denim jacket in great condition. Perfect for casual outings.',
      'Nike AF1 sneakers, worn only twice. Comes with original box.',
      'Professional blazer for interviews and presentations. Like new condition.',
    ],
  },
  [ListingCategory.APPLIANCES]: {
    titles: [
      'Mini Refrigerator (50L)',
      'Electric Kettle 1.5L',
      'Standing Fan with Remote',
    ],
    descriptions: [
      'Compact mini fridge perfect for hostel rooms. Energy efficient.',
      'Fast-boiling electric kettle. Auto shut-off feature included.',
      'Quiet standing fan with 3 speed settings and timer function.',
    ],
  },
  [ListingCategory.ACCESSORIES]: {
    titles: [
      'Laptop Backpack (Anti-theft)',
      'Wristwatch (Casio Classic)',
      'Sunglasses (Polarized UV400)',
    ],
    descriptions: [
      'Spacious anti-theft backpack with USB charging port. Water-resistant.',
      'Classic Casio watch with digital display. Original product.',
      'Stylish polarized sunglasses. Great for outdoor activities.',
    ],
  },
  [ListingCategory.SPORTS]: {
    titles: [
      'Football (Adidas Match Ball)',
      'Yoga Mat with Carry Bag',
      'Dumbbells Set (10kg pair)',
    ],
    descriptions: [
      'Official size Adidas football. Perfect for campus games.',
      'Non-slip yoga mat with carrying bag. Great for exercise.',
      'Quality dumbbells set for home workouts. Rubber coated.',
    ],
  },
  [ListingCategory.BEAUTY]: {
    titles: [
      'Skincare Gift Set',
      'Hair Dryer Professional',
      'Makeup Brush Set (12 pieces)',
    ],
    descriptions: [
      'Complete skincare set with cleanser, toner, and moisturizer. Unopened.',
      'Professional hair dryer with multiple heat settings. Fast drying.',
      'Quality makeup brush set with carrying case. Soft bristles.',
    ],
  },
  [ListingCategory.FOOD]: {
    titles: [
      'Homemade Chin Chin (1kg)',
      'Fresh Zobo Drink (5 Liters)',
      'Assorted Small Chops Platter',
    ],
    descriptions: [
      'Crispy homemade chin chin. Perfect for snacking. Made with love.',
      'Refreshing zobo drink made with natural ingredients. No preservatives.',
      'Party platter with spring rolls, samosa, and puff puff. Pre-order available.',
    ],
  },
  [ListingCategory.SERVICES]: {
    titles: [
      'Laptop Repair Services',
      'Assignment Help (Engineering)',
      'Photography Session',
    ],
    descriptions: [
      'Professional laptop repair and maintenance. Software and hardware issues.',
      'Tutoring and assignment assistance for engineering courses.',
      'Professional photography for events, portraits, and graduation.',
    ],
  },
  [ListingCategory.OTHER]: {
    titles: [
      'Room Decoration Set',
      'Board Games Collection',
      'Portable Projector',
    ],
    descriptions: [
      'Set of fairy lights, posters, and wall decorations for your room.',
      'Collection of board games including Monopoly, Scrabble, and Chess.',
      'Mini portable projector for movies and presentations. HDMI compatible.',
    ],
  },
};

// Get listing data for a category
function getListingData(category: ListingCategory, index: number) {
  const template = listingTemplates[category];
  const titleIndex = index % template.titles.length;
  return {
    title: template.titles[titleIndex],
    description: template.descriptions[titleIndex],
  };
}

async function seed() {
  console.log('Connecting to database...');
  await dataSource.initialize();
  console.log('Connected successfully!');

  const universityRepo = dataSource.getRepository(University);
  const facultyRepo = dataSource.getRepository(Faculty);
  const departmentRepo = dataSource.getRepository(Department);
  const userRepo = dataSource.getRepository(User);
  const walletRepo = dataSource.getRepository(Wallet);
  const listingRepo = dataSource.getRepository(Listing);

  // Get first university from database
  const university = await universityRepo.findOne({
    where: {},
    order: { createdAt: 'ASC' },
  });

  if (!university) {
    console.error('No university found! Please run the university seed first.');
    await dataSource.destroy();
    process.exit(1);
  }

  console.log(`Using university: ${university.name} (${university.code})`);

  // Get two different faculties from this university
  const faculties = await facultyRepo.find({
    where: { universityId: university.id },
    take: 2,
  });

  if (faculties.length < 2) {
    console.error('University must have at least 2 faculties!');
    await dataSource.destroy();
    process.exit(1);
  }

  const faculty1 = faculties[0];
  const faculty2 = faculties[1];

  console.log(`Faculty 1: ${faculty1.name}`);
  console.log(`Faculty 2: ${faculty2.name}`);

  // Get a department from each faculty
  const department1 = await departmentRepo.findOne({
    where: { facultyId: faculty1.id },
  });
  const department2 = await departmentRepo.findOne({
    where: { facultyId: faculty2.id },
  });

  if (!department1 || !department2) {
    console.error('Each faculty must have at least one department!');
    await dataSource.destroy();
    process.exit(1);
  }

  console.log(`Department 1: ${department1.name}`);
  console.log(`Department 2: ${department2.name}`);

  // Hash password
  const defaultPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);

  // Create User 1
  const user1 = userRepo.create({
    phone: generatePhone(),
    phoneVerified: true,
    phoneVerifiedAt: new Date(),
    email: `testuser1.${Date.now()}@gmail.com`,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    passwordHash,
    fullName: 'Chukwuemeka Okonkwo',
    universityId: university.id,
    facultyId: faculty1.id,
    departmentId: department1.id,
    yearOfStudy: YearOfStudy.YEAR_3,
    verificationTier: VerificationTier.TIER_2,
    tier1ReviewStatus: Tier1ReviewStatus.APPROVED,
    tier1ApprovedAt: new Date(),
    bvnVerified: true,
  });
  await userRepo.save(user1);
  console.log(`Created User 1: ${user1.fullName} (${user1.email})`);

  // Create Wallet 1 (no balance)
  const wallet1 = walletRepo.create({
    userId: user1.id,
    balance: 0,
    lockedBalance: 0,
  });
  await walletRepo.save(wallet1);
  console.log(`Created Wallet for User 1 (balance: ₦0)`);

  // Create User 2
  const user2 = userRepo.create({
    phone: generatePhone(),
    phoneVerified: true,
    phoneVerifiedAt: new Date(),
    email: `testuser2.${Date.now()}@gmail.com`,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    passwordHash,
    fullName: 'Adaeze Nwosu',
    universityId: university.id,
    facultyId: faculty2.id,
    departmentId: department2.id,
    yearOfStudy: YearOfStudy.YEAR_4,
    verificationTier: VerificationTier.TIER_2,
    tier1ReviewStatus: Tier1ReviewStatus.APPROVED,
    tier1ApprovedAt: new Date(),
    bvnVerified: true,
  });
  await userRepo.save(user2);
  console.log(`Created User 2: ${user2.fullName} (${user2.email})`);

  // Create Wallet 2 (no balance)
  const wallet2 = walletRepo.create({
    userId: user2.id,
    balance: 0,
    lockedBalance: 0,
  });
  await walletRepo.save(wallet2);
  console.log(`Created Wallet for User 2 (balance: ₦0)`);

  // Categories to use for listings
  const categories = [
    ListingCategory.ELECTRONICS,
    ListingCategory.BOOKS,
    ListingCategory.LAPTOPS,
    ListingCategory.PHONES,
    ListingCategory.FURNITURE,
    ListingCategory.CLOTHING,
    ListingCategory.APPLIANCES,
    ListingCategory.ACCESSORIES,
    ListingCategory.SPORTS,
    ListingCategory.BEAUTY,
    ListingCategory.FOOD,
    ListingCategory.SERVICES,
    ListingCategory.OTHER,
    ListingCategory.ELECTRONICS,
    ListingCategory.BOOKS,
  ];

  const conditions = [
    ListingCondition.NEW,
    ListingCondition.LIKE_NEW,
    ListingCondition.USED_GOOD,
    ListingCondition.USED_FAIR,
  ];

  const deliveryOptions = [
    DeliveryOption.PICKUP_ONLY,
    DeliveryOption.DELIVERY_AVAILABLE,
    DeliveryOption.MEETUP,
  ];

  const meetupLocations = [
    'Main Gate',
    'Library Building',
    'Student Union Building',
    'Faculty Building',
    'Sports Complex',
    'Cafeteria',
  ];

  console.log('\nCreating listings...');

  // Create 5 listings scoped to Faculty 1 (User 1 sells 3, User 2 sells 2)
  console.log(`\nFaculty-scoped listings for ${faculty1.name}:`);
  for (let i = 0; i < 5; i++) {
    const seller = i < 3 ? user1 : user2;
    const category = categories[i];
    const listingData = getListingData(category, i);

    const listing = listingRepo.create({
      sellerId: seller.id,
      universityId: university.id,
      type: ListingType.SELL,
      title: listingData.title,
      description: listingData.description,
      category,
      condition: randomElement(conditions),
      price: randomInt(2000, 150000),
      isNegotiable: Math.random() > 0.3,
      visibilityScope: VisibilityScope.FACULTY,
      facultyId: faculty1.id,
      deliveryOption: randomElement(deliveryOptions),
      meetupLocation: randomElement(meetupLocations),
      status: ListingStatus.ACTIVE,
      viewCount: randomInt(0, 50),
      favoriteCount: randomInt(0, 10),
    });
    await listingRepo.save(listing);
    console.log(`  [${i + 1}] ${listing.title} - ₦${listing.price.toLocaleString()} (Seller: ${seller.fullName})`);
  }

  // Create 5 listings scoped to Faculty 2 (User 2 sells 3, User 1 sells 2)
  console.log(`\nFaculty-scoped listings for ${faculty2.name}:`);
  for (let i = 0; i < 5; i++) {
    const seller = i < 3 ? user2 : user1;
    const category = categories[i + 5];
    const listingData = getListingData(category, i);

    const listing = listingRepo.create({
      sellerId: seller.id,
      universityId: university.id,
      type: ListingType.SELL,
      title: listingData.title,
      description: listingData.description,
      category,
      condition: randomElement(conditions),
      price: randomInt(2000, 150000),
      isNegotiable: Math.random() > 0.3,
      visibilityScope: VisibilityScope.FACULTY,
      facultyId: faculty2.id,
      deliveryOption: randomElement(deliveryOptions),
      meetupLocation: randomElement(meetupLocations),
      status: ListingStatus.ACTIVE,
      viewCount: randomInt(0, 50),
      favoriteCount: randomInt(0, 10),
    });
    await listingRepo.save(listing);
    console.log(`  [${i + 1}] ${listing.title} - ₦${listing.price.toLocaleString()} (Seller: ${seller.fullName})`);
  }

  // Create 5 university-wide listings (distributed between both users)
  console.log(`\nUniversity-wide listings:`);
  for (let i = 0; i < 5; i++) {
    const seller = i % 2 === 0 ? user1 : user2;
    const category = categories[i + 10];
    const listingData = getListingData(category, i);

    const listing = listingRepo.create({
      sellerId: seller.id,
      universityId: university.id,
      type: ListingType.SELL,
      title: listingData.title,
      description: listingData.description,
      category,
      condition: randomElement(conditions),
      price: randomInt(2000, 150000),
      isNegotiable: Math.random() > 0.3,
      visibilityScope: VisibilityScope.UNIVERSITY,
      facultyId: null,
      deliveryOption: randomElement(deliveryOptions),
      meetupLocation: randomElement(meetupLocations),
      status: ListingStatus.ACTIVE,
      viewCount: randomInt(0, 50),
      favoriteCount: randomInt(0, 10),
    });
    await listingRepo.save(listing);
    console.log(`  [${i + 1}] ${listing.title} - ₦${listing.price.toLocaleString()} (Seller: ${seller.fullName})`);
  }

  console.log('\n========== Seed Complete ==========');
  console.log(`University: ${university.name}`);
  console.log(`Users created: 2`);
  console.log(`  - ${user1.fullName} (${faculty1.name})`);
  console.log(`  - ${user2.fullName} (${faculty2.name})`);
  console.log(`Wallets created: 2 (balance: ₦0 each)`);
  console.log(`Listings created: 15`);
  console.log(`  - 5 scoped to ${faculty1.name}`);
  console.log(`  - 5 scoped to ${faculty2.name}`);
  console.log(`  - 5 university-wide`);
  console.log(`Default password: ${defaultPassword}`);
  console.log('====================================\n');

  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
