import { DataSource } from 'typeorm';
import { Admin, AdminRole } from '../entities/admin.entity';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';

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
  entities: [Admin],
  synchronize: false,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

interface AdminConfig {
  email: string;
  password: string;
  fullName: string;
  role: AdminRole;
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function getAdminConfig(): Promise<AdminConfig> {
  // Check for environment variables first (for CI/CD or scripted usage)
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    console.log('Using environment variables for admin configuration...');
    return {
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      fullName: process.env.ADMIN_FULL_NAME || 'System Administrator',
      role: (process.env.ADMIN_ROLE as AdminRole) || AdminRole.SUPER_ADMIN,
    };
  }

  // Interactive mode
  console.log('\n=== Create Admin User ===\n');

  const email = await prompt('Email: ');
  if (!email) throw new Error('Email is required');

  const password = await prompt('Password (min 8 characters): ');
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const fullName = await prompt('Full Name: ');
  if (!fullName) throw new Error('Full name is required');

  const roleInput = await prompt('Role (admin/super_admin) [super_admin]: ');
  const role = roleInput === 'admin' ? AdminRole.ADMIN : AdminRole.SUPER_ADMIN;

  return { email, password, fullName, role };
}

async function createAdmin() {
  console.log('Connecting to database...');
  await dataSource.initialize();
  console.log('Connected successfully!\n');

  try {
    const config = await getAdminConfig();

    // Check if admin already exists
    const adminRepo = dataSource.getRepository(Admin);
    const existing = await adminRepo.findOne({
      where: { email: config.email },
    });

    if (existing) {
      throw new Error(`Admin already exists with email "${config.email}"`);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(config.password, 12);

    // Create admin
    const admin = adminRepo.create({
      email: config.email,
      passwordHash,
      fullName: config.fullName,
      role: config.role,
    });

    await adminRepo.save(admin);

    console.log('\n========== Admin Created ==========');
    console.log(`ID: ${admin.id}`);
    console.log(`Email: ${admin.email}`);
    console.log(`Name: ${admin.fullName}`);
    console.log(`Role: ${admin.role}`);
    console.log('====================================\n');
  } finally {
    await dataSource.destroy();
  }
}

createAdmin().catch((error) => {
  console.error('\nFailed to create admin:', error.message);
  process.exit(1);
});
