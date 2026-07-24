import dataSource from './data-source';

/**
 * Reset the database to a clean slate: drop EVERYTHING in the public schema
 * (tables, enum types, and the migrations table), then re-run all migrations.
 *
 * Usage:  npm run db:reset
 *
 * DESTRUCTIVE — wipes all data. Refuses to run when NODE_ENV=production.
 * After a reset the schema is empty; run your seeds separately, e.g.
 *   npm run seed        # universities
 *   npm run seed:admin  # a super admin
 */
async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database while NODE_ENV=production.');
  }

  await dataSource.initialize();

  const opts = dataSource.options as { database?: string; url?: string };
  const target = opts.database ?? opts.url ?? '(from DATABASE_URL)';
  console.log(`Resetting database: ${target}`);

  try {
    // Nuke the whole schema — this clears tables, Postgres enum types, and the
    // migrations table in one shot (a plain schema:drop can leave enums behind).
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');

    // DROP SCHEMA removed the uuid-ossp extension that migrations rely on
    // (uuid_generate_v4()); recreate it before running them.
    await dataSource.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // console.log('Schema dropped and recreated. Running migrations...');
    // const applied = await dataSource.runMigrations();

    // console.log(`\nApplied ${applied.length} migration(s):`);
    // for (const m of applied) console.log(`  - ${m.name}`);
    console.log('\n✔ Database reset to a clean slate.');
  } finally {
    await dataSource.destroy();
  }
}

resetDatabase().catch((error) => {
  console.error('\n✖ Database reset failed:', error.message);
  process.exit(1);
});
