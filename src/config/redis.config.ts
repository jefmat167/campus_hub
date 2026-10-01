import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheModuleOptions } from '@nestjs/cache-manager';
import Redis from 'ioredis';
import Keyv from 'keyv';
import { IoRedisKeyvStore } from './ioredis-keyv-store';

/** Key prefix — the Redis instance is shared with BullMQ (`bull:*`). */
export const CACHE_NAMESPACE = 'campus_hub';

export const redisConfig = async (
  configService: ConfigService,
): Promise<CacheModuleOptions> => {
  const host = configService.get<string>('REDIS_HOST', 'localhost');
  const port = configService.get<number>('REDIS_PORT', 6379);
  const password = configService.get<string>('REDIS_PASSWORD', '');

  const client = new Redis({
    host,
    port,
    password: password || undefined,
    // Fail fast when Redis is down: a cache miss beats a request hanging on
    // ioredis' default 20 retries. Keyv then emits (logged below) and returns
    // undefined rather than throwing.
    maxRetriesPerRequest: 2,
  });

  const store = new Keyv({
    store: new IoRedisKeyvStore(client),
    namespace: CACHE_NAMESPACE,
  });
  const logger = new Logger('CacheStore');
  store.on('error', (err: unknown) =>
    logger.error(`Redis cache error: ${err instanceof Error ? err.message : String(err)}`),
  );

  // `stores` (plural) is what @nestjs/cache-manager 3 reads; a `store` key is
  // silently ignored and the cache falls back to in-process memory.
  return {
    stores: [store],
    ttl: 60_000, // default TTL: 1 minute (every caller passes its own)
  };
};
