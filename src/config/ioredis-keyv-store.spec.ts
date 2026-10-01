import Keyv from 'keyv';
import { IoRedisKeyvStore } from './ioredis-keyv-store';

/** Minimal in-memory stand-in for the ioredis calls the adapter makes. */
function fakeRedis(initial: Record<string, string> = {}) {
  const data = new Map<string, string>(Object.entries(initial));
  const ttls = new Map<string, number>();
  const client: any = {
    on: jest.fn(),
    get: jest.fn(async (k: string) => data.get(k) ?? null),
    set: jest.fn(async (k: string, v: string, mode?: string, ms?: number) => {
      data.set(k, v);
      if (mode === 'PX') ttls.set(k, ms!);
      return 'OK';
    }),
    del: jest.fn(async (...keys: string[]) => keys.filter((k) => data.delete(k)).length),
    exists: jest.fn(async (k: string) => (data.has(k) ? 1 : 0)),
    scan: jest.fn(async (_cursor: string, _m: string, pattern: string) => {
      const prefix = pattern.replace(/\*$/, '');
      return ['0', [...data.keys()].filter((k) => k.startsWith(prefix))];
    }),
    quit: jest.fn(async () => 'OK'),
  };
  return { client, data, ttls };
}

describe('IoRedisKeyvStore behind Keyv (the cache-manager 7 path)', () => {
  it('round-trips JSON values under the namespace with a millisecond TTL', async () => {
    const { client, data, ttls } = fakeRedis();
    const keyv = new Keyv({ store: new IoRedisKeyvStore(client), namespace: 'campus_hub' });

    await keyv.set('blacklist:jti-1', '1', 900_000);
    await keyv.set('perm:a1', ['escrow:read', 'news:manage'], 300_000);

    expect([...data.keys()].sort()).toEqual(['campus_hub:blacklist:jti-1', 'campus_hub:perm:a1']);
    expect(ttls.get('campus_hub:blacklist:jti-1')).toBe(900_000);
    expect(await keyv.get('blacklist:jti-1')).toBe('1');
    expect(await keyv.get('perm:a1')).toEqual(['escrow:read', 'news:manage']);
    expect(await keyv.get('missing')).toBeUndefined();

    await keyv.delete('blacklist:jti-1');
    expect(await keyv.get('blacklist:jti-1')).toBeUndefined();
  });

  it('clear() only deletes its own namespace — never other apps or BullMQ keys', async () => {
    const { client, data } = fakeRedis({
      'bull:escrow:id': '104',
      'other_app:session': 'x',
      'campus_hub:university_settings:u1': '{}',
    });
    const keyv = new Keyv({ store: new IoRedisKeyvStore(client), namespace: 'campus_hub' });

    await keyv.clear();

    expect([...data.keys()].sort()).toEqual(['bull:escrow:id', 'other_app:session']);
  });

  it('clear() without a namespace is a no-op rather than a flush', async () => {
    const { client, data } = fakeRedis({ 'bull:escrow:id': '104' });
    const store = new IoRedisKeyvStore(client);
    store.namespace = undefined;

    await store.clear();

    expect(client.scan).not.toHaveBeenCalled();
    expect(data.size).toBe(1);
  });
});
