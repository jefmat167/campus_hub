import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');
  // Full SQL echo is opt-in (DB_LOGGING=true) — it floods the console on every
  // request. Default: errors/warnings/schema/migration output + slow queries.
  const logAllQueries = configService.get<string>('DB_LOGGING') === 'true';

  return {
    type: 'postgres',
    // Use connection URL if provided, otherwise fall back to individual params
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: configService.get<string>('DB_HOST'),
          port: configService.get<number>('DB_PORT'),
          username: configService.get<string>('DB_USERNAME'),
          password: configService.get<string>('DB_PASSWORD'),
          database: configService.get<string>('DB_NAME'),
        }),
    entities: [__dirname + '/../database/entities/*.entity{.ts,.js}'],
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    // IMPORTANT: never true — schema changes go through hand-written migrations
    synchronize: false,
    logging: logAllQueries ? 'all' : ['error', 'warn', 'schema', 'migration'],
    // Queries slower than this are logged regardless of the level above.
    maxQueryExecutionTime: 1000,
    ssl:
      configService.get<string>('NODE_ENV') === 'production'
        ? { rejectUnauthorized: false }
        : false,
    extra: {
      max: 20,
      min: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    },
  };
};
