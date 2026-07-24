import { DataSource } from 'typeorm';
import { University } from '../entities/university.entity';
import { Faculty } from '../entities/faculty.entity';
import { Department } from '../entities/department.entity';
import { User, VerificationTier, Tier1ReviewStatus, YearOfStudy } from '../entities/user.entity';
import {
  RoommateProfile,
  Gender,
  CleanlinessLevel,
  NoiseLevel,
  SleepSchedule,
  StudyHabit,
  RoommateProfileStatus,
} from '../entities/roommate.entity';
import { Wallet, WalletTransaction } from '../entities/wallet.entity';
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
  entities: [University, Faculty, Department, User, RoommateProfile, Wallet, WalletTransaction],
  synchronize: false,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

// Nigerian first names
const maleFirstNames = [
  'Chukwuemeka', 'Oluwaseun', 'Adebayo', 'Chijioke', 'Olumide',
  'Tunde', 'Ifeanyi', 'Obinna', 'Yusuf', 'Emeka',
  'Chinedu', 'Damilare', 'Ikenna', 'Kingsley', 'Nnamdi',
  'Adekunle', 'Folarin', 'Ugochukwu', 'Ayomide', 'Babatunde',
];

const femaleFirstNames = [
  'Chioma', 'Oluwabunmi', 'Adaeze', 'Ngozi', 'Funke',
  'Aisha', 'Nneka', 'Tolulope', 'Blessing', 'Chiamaka',
  'Adaobi', 'Temitope', 'Ifeoma', 'Kemi', 'Amara',
  'Yetunde', 'Ebere', 'Zainab', 'Onyinye', 'Folashade',
];

const lastNames = [
  'Okonkwo', 'Adeyemi', 'Nwosu', 'Ibrahim', 'Okafor',
  'Adeleke', 'Eze', 'Bello', 'Uzoma', 'Abubakar',
  'Chukwu', 'Ogunleye', 'Musa', 'Onuoha', 'Bakare',
  'Nwachukwu', 'Adewale', 'Okoro', 'Mohammed', 'Igwe',
];

// Areas near Nigerian universities
const universityAreas: Record<string, string[]> = {
  default: ['Off Campus', 'Near Gate', 'Town Area', 'Student Village'],
  UNILAG: ['Akoka', 'Yaba', 'Bariga', 'Onike', 'Abule Oja'],
  UI: ['Bodija', 'Agbowo', 'Sango', 'Ojoo', 'Samonda'],
  OAU: ['Mayfair', 'Road 7', 'Opa', 'Moore', 'Fajuyi'],
  FUTA: ['Aule', 'FUTA South Gate', 'Obanla', 'Oba Nla'],
  LASU: ['Ojo', 'Festac', 'Okoko', 'Igando'],
  ABU: ['Samaru', 'Sabon Gari', 'Tudun Wada'],
  UNN: ['Nsukka Town', 'Hilltop', 'Odenigbo'],
  UNIBEN: ['Ekosodin', 'Ugbowo', 'BDPA', 'Osasogie'],
};

// Helper functions
function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomBoolean(probability = 0.5): boolean {
  return Math.random() < probability;
}

function generatePhone(): string {
  const prefixes = ['0803', '0805', '0806', '0807', '0808', '0809', '0810', '0813', '0814', '0816', '0903', '0906'];
  return randomElement(prefixes) + String(randomInt(1000000, 9999999));
}

function generateEmail(firstName: string, lastName: string, index: number): string {
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@${randomElement(domains)}`;
}

function getAreasForUniversity(universityCode: string): string[] {
  return universityAreas[universityCode] || universityAreas.default;
}

async function seed() {
  console.log('Connecting to database...');
  await dataSource.initialize();
  console.log('Connected successfully!');

  const universityRepo = dataSource.getRepository(University);
  const facultyRepo = dataSource.getRepository(Faculty);
  const departmentRepo = dataSource.getRepository(Department);
  const userRepo = dataSource.getRepository(User);
  const roommateRepo = dataSource.getRepository(RoommateProfile);
  const walletRepo = dataSource.getRepository(Wallet);

  // Get all universities
  const universities = await universityRepo.find();
  if (universities.length === 0) {
    console.error('No universities found! Please run the university seed first.');
    await dataSource.destroy();
    process.exit(1);
  }

  console.log(`Found ${universities.length} universities`);

  // Hash password once for all users
  const defaultPassword = 'Password123!';
  const passwordHash = await bcrypt.hash(defaultPassword, 10);
  // Default transaction PIN (dev): 135790 — lets seeded users transact.
  const pinHash = await bcrypt.hash('135790', 12);

  let userCount = 0;
  let roommateCount = 0;
  let walletCount = 0;

  const usersPerUniversity = 10;

  for (const university of universities) {
    console.log(`\nSeeding users for ${university.name} (${university.code})...`);

    // Get faculties and departments for this university
    const faculties = await facultyRepo.find({ where: { universityId: university.id } });
    if (faculties.length === 0) {
      console.log(`  No faculties found for ${university.code}, skipping...`);
      continue;
    }

    const areas = getAreasForUniversity(university.code);

    for (let i = 0; i < usersPerUniversity; i++) {
      // Randomly select gender
      const isMale = randomBoolean();
      const gender = isMale ? Gender.MALE : Gender.FEMALE;
      const firstName = randomElement(isMale ? maleFirstNames : femaleFirstNames);
      const lastName = randomElement(lastNames);
      const fullName = `${firstName} ${lastName}`;

      // Random faculty and department
      const faculty = randomElement(faculties);
      const departments = await departmentRepo.find({ where: { facultyId: faculty.id } });
      if (departments.length === 0) continue;
      const department = randomElement(departments);

      // Generate unique identifiers
      const phone = generatePhone();
      const email = generateEmail(firstName, lastName, randomInt(1, 9999));

      // Create user
      const user = userRepo.create({
        phone,
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        email,
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash,
        pinHash,
        fullName,
        gender,
        universityId: university.id,
        facultyId: faculty.id,
        departmentId: department.id,
        yearOfStudy: randomElement(Object.values(YearOfStudy)),
        verificationTier: VerificationTier.TIER_1,
        tier1ReviewStatus: Tier1ReviewStatus.APPROVED,
        tier1ApprovedAt: new Date(),
      });

      try {
        await userRepo.save(user);
        userCount++;
      } catch (error) {
        // Skip if duplicate phone/email
        console.log(`  Skipping duplicate user: ${email}`);
        continue;
      }

      // Create wallet with 1,000,000 balance
      const wallet = walletRepo.create({
        userId: user.id,
        balance: 1000000,
        lockedBalance: 0,
      });
      await walletRepo.save(wallet);
      walletCount++;

      // Create roommate profile
      const age = randomInt(17, 28);
      const budgetMin = randomElement([15000, 20000, 25000, 30000, 35000, 40000]);
      const budgetMax = budgetMin + randomElement([10000, 15000, 20000, 25000, 30000]);

      const roommateProfile = roommateRepo.create({
        userId: user.id,
        universityId: university.id,
        status: RoommateProfileStatus.ACTIVE,
        gender,
        age,
        bio: `${fullName} is a ${randomElement(['friendly', 'focused', 'easygoing', 'studious', 'sociable'])} ${department.name} student looking for a compatible roommate.`,
        budgetMin,
        budgetMax,
        preferredAreas: [randomElement(areas), randomElement(areas)].filter((v, i, a) => a.indexOf(v) === i),
        moveInDate: randomBoolean(0.7) ? new Date(Date.now() + randomInt(7, 90) * 24 * 60 * 60 * 1000) : null,
        moveInFlexible: randomBoolean(0.6),
        cleanliness: randomElement(Object.values(CleanlinessLevel)),
        noiseLevel: randomElement(Object.values(NoiseLevel)),
        sleepSchedule: randomElement(Object.values(SleepSchedule)),
        studyHabit: randomElement(Object.values(StudyHabit)),
        smokes: randomBoolean(0.1),
        drinks: randomBoolean(0.3),
        hasPets: randomBoolean(0.05),
        allowsVisitors: randomBoolean(0.7),
        preferredGender: randomBoolean(0.6) ? gender : null,
        preferredAgeMin: randomBoolean(0.5) ? age - 2 : null,
        preferredAgeMax: randomBoolean(0.5) ? age + 3 : null,
        preferredCleanliness: randomBoolean(0.4) ? randomElement(Object.values(CleanlinessLevel)) : null,
        preferredNoiseLevel: randomBoolean(0.4) ? randomElement(Object.values(NoiseLevel)) : null,
        preferredSleepSchedule: randomBoolean(0.4) ? randomElement(Object.values(SleepSchedule)) : null,
        nonSmokerOnly: randomBoolean(0.7),
        nonDrinkerOnly: randomBoolean(0.3),
        noPetsAllowed: randomBoolean(0.5),
        interests: randomBoolean(0.8)
          ? [
              randomElement(['Football', 'Music', 'Movies', 'Gaming', 'Reading', 'Cooking', 'Fitness', 'Photography']),
              randomElement(['Dancing', 'Fashion', 'Tech', 'Art', 'Travel', 'Sports', 'Comedy', 'Networking']),
            ].filter((v, i, a) => a.indexOf(v) === i)
          : null,
        languages: ['English', randomBoolean(0.7) ? randomElement(['Yoruba', 'Igbo', 'Hausa', 'Pidgin']) : null].filter(Boolean) as string[],
      });

      await roommateRepo.save(roommateProfile);
      roommateCount++;
    }

    console.log(`  Created ${usersPerUniversity} users for ${university.code}`);
  }

  console.log('\n========== Seed Complete ==========');
  console.log(`Users created: ${userCount}`);
  console.log(`Roommate profiles created: ${roommateCount}`);
  console.log(`Wallets created: ${walletCount}`);
  console.log(`Default password for all users: ${defaultPassword}`);
  console.log('====================================\n');

  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
