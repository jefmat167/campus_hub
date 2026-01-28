import { ConfigService } from '@nestjs/config';
import { CacheModuleOptions } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';

export const redisConfig = async (
  configService: ConfigService,
): Promise<CacheModuleOptions> => {
  const host = configService.get<string>('REDIS_HOST', 'localhost');
  const port = configService.get<number>('REDIS_PORT', 6379);
  const password = configService.get<string>('REDIS_PASSWORD', '');

  return {
    store: await redisStore({
      host,
      port,
      password: password || undefined,
      ttl: 60000, // Default TTL: 1 minute
    }),
  };
};
