import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const typeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => {
  const databaseUrl = configService.get<string>('DATABASE_URL');

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
    // IMPORTANT: Set to false - use migrations for schema changes
    // Set to true ONLY for initial rapid prototyping, then run migration:generate
    synchronize: false,
    logging: configService.get<string>('NODE_ENV') === 'development',
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
