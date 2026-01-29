import { DataSource } from 'typeorm';
import { University } from '../entities/university.entity';
import { Faculty } from '../entities/faculty.entity';
import { Department } from '../entities/department.entity';
import universitiesSeedData from './universities.seed';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env.local') });

const databaseUrl = process.env.DATABASE_URL;

const dataSource = new DataSource({
  type: 'postgres',
  // Use connection URL if provided, otherwise fall back to individual params
  ...(databaseUrl
    ? { url: databaseUrl }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'campus_hub',
      }),
  entities: [University, Faculty, Department],
  synchronize: true,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

async function seed() {
  console.log('Connecting to database...');
  await dataSource.initialize();
  console.log('Connected successfully!');

  const universityRepo = dataSource.getRepository(University);
  const facultyRepo = dataSource.getRepository(Faculty);
  const departmentRepo = dataSource.getRepository(Department);

  console.log('Checking existing data...');
  const existingCount = await universityRepo.count();

  if (existingCount > 0) {
    console.log(`Found ${existingCount} universities. Skipping seed.`);
    console.log('To re-seed, clear the universities table first.');
    await dataSource.destroy();
    return;
  }

  console.log('Seeding universities...');
  let universityCount = 0;
  let facultyCount = 0;
  let departmentCount = 0;

  for (const uniData of universitiesSeedData) {
    // Create university
    const university = universityRepo.create({
      name: uniData.name,
      code: uniData.code,
      state: uniData.state,
      city: uniData.city,
      type: uniData.type,
      website: uniData.website,
      isActive: true,
    });
    await universityRepo.save(university);
    universityCount++;

    // Create faculties and departments
    for (const facData of uniData.faculties) {
      const faculty = facultyRepo.create({
        name: facData.name,
        code: facData.code,
        universityId: university.id,
        isActive: true,
      });
      await facultyRepo.save(faculty);
      facultyCount++;

      // Create departments
      for (const deptData of facData.departments) {
        const department = departmentRepo.create({
          name: deptData.name,
          code: deptData.code,
          facultyId: faculty.id,
          isActive: true,
        });
        await departmentRepo.save(department);
        departmentCount++;
      }
    }

    console.log(`Seeded: ${uniData.name} (${uniData.code})`);
  }

  console.log('\n========== Seed Complete ==========');
  console.log(`Universities: ${universityCount}`);
  console.log(`Faculties: ${facultyCount}`);
  console.log(`Departments: ${departmentCount}`);
  console.log('====================================\n');

  await dataSource.destroy();
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
