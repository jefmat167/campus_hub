import { EventEmitter } from 'events';
import Redis from 'ioredis';
import type { KeyvStoreAdapter, StoredData } from 'keyv';

/**
 * Keyv storage adapter over the app's existing ioredis client.
 *
 * @nestjs/cache-manager 3 / cache-manager 7 are Keyv-based and read
 * `options.stores`; the old `cache-manager-ioredis-yet` store targets
 * cache-manager 5 and was passed as `store`, which Nest silently ignored — so
 * the "Redis" cache (JWT blacklist, SMS OTPs, admin permissions, caps,
 * university settings) was per-process memory until 2026-09-30.
 *
 * Keyv serializes values (and prefixes keys with its namespace) before they
 * reach this adapter, so it only moves strings with a millisecond TTL.
 */
export class IoRedisKeyvStore extends EventEmitter implements KeyvStoreAdapter {
  opts: Record<string, unknown> = {};
  namespace?: string;

  constructor(private readonly client: Redis) {
    super();
    this.client.on('error', (err) => this.emit('error', err));
  }

  async get<Value>(key: string): Promise<StoredData<Value> | undefined> {
    const value = await this.client.get(key);
    return (value ?? undefined) as StoredData<Value> | undefined;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttl && ttl > 0) {
      await this.client.set(key, raw, 'PX', Math.ceil(ttl));
    } else {
      await this.client.set(key, raw);
    }
  }

  async delete(key: string): Promise<boolean> {
    return (await this.client.del(key)) > 0;
  }

  async has(key: string): Promise<boolean> {
    return (await this.client.exists(key)) === 1;
  }

  /**
   * Deletes only this namespace's keys. Never FLUSHDB — the Redis instance is
   * shared with BullMQ (and, locally, with other projects).
   */
  async clear(): Promise<void> {
    if (!this.namespace) return;
    const match = `${this.namespace}:*`;
    let cursor = '0';
    do {
      const [next, keys] = await this.client.scan(cursor, 'MATCH', match, 'COUNT', 500);
      cursor = next;
      if (keys.length) await this.client.del(...keys);
    } while (cursor !== '0');
  }

  async disconnect(): Promise<void> {
    await this.client.quit();
  }
}
