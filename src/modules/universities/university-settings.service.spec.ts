import { NotFoundException } from '@nestjs/common';
import { UniversitySettingsService } from './university-settings.service';
import { UniversitySettings } from '../../database/entities/university-settings.entity';

/**
 * Per-university settings resolution: defaults, NULL-column fallback, cache
 * behaviour (read-through + bust on write), the upsert path, and drop-point
 * basics. Mirrors the repo's direct-instantiation spec style.
 */
function makeService(opts: {
  settingsRow?: Partial<UniversitySettings> | null;
  universityExists?: boolean;
  dropPoints?: any[];
  dropPoint?: any;
} = {}) {
  const settingsRow = opts.settingsRow ?? null;

  const settingsRepo: any = {
    findOne: jest.fn(async () => settingsRow),
    create: (o: any) => ({ ...o }),
    save: jest.fn(async (r: any) => ({ id: r.id ?? 'us1', ...r })),
  };
  const dropPointRepo: any = {
    find: jest.fn(async () => opts.dropPoints ?? []),
    findOne: jest.fn(async () => opts.dropPoint ?? null),
    create: (o: any) => ({ ...o }),
    save: jest.fn(async (r: any) => ({ id: r.id ?? 'dp1', ...r })),
  };
  const universityRepo: any = {
    findOne: jest.fn(async () =>
      (opts.universityExists ?? true) ? { id: 'u1' } : null,
    ),
  };
  const cacheStore = new Map<string, unknown>();
  const cache: any = {
    get: jest.fn(async (k: string) => cacheStore.get(k)),
    set: jest.fn(async (k: string, v: unknown) => {
      cacheStore.set(k, v);
    }),
    del: jest.fn(async (k: string) => {
      cacheStore.delete(k);
    }),
  };
  const config: any = { get: (_k: string, d: any) => d };

  const svc = new UniversitySettingsService(
    settingsRepo,
    dropPointRepo,
    universityRepo,
    cache,
    config,
  );
  return { svc, settingsRepo, dropPointRepo, universityRepo, cache, cacheStore };
}

describe('UniversitySettingsService.resolve', () => {
  it('returns pure platform defaults when no override row exists', async () => {
    const { svc } = makeService({ settingsRow: null });

    const resolved = await svc.resolve('u1');

    expect(resolved).toEqual({
      p2pFeePercent: 2.5,
      vendorFeePercent: 2.5,
      cancellationFeePercent: 10,
      cancellationFeeEnabled: true,
    });
  });

  it('merges overrides over defaults; NULL columns fall back individually', async () => {
    const { svc } = makeService({
      settingsRow: {
        // pg numerics come back as strings — the service must Number() them
        p2pFeePercent: '5.00' as unknown as number,
        vendorFeePercent: null,
        cancellationFeePercent: null,
        cancellationFeeEnabled: false,
      },
    });

    const resolved = await svc.resolve('u1');

    expect(resolved.p2pFeePercent).toBe(5);
    expect(resolved.vendorFeePercent).toBe(2.5); // NULL → default
    expect(resolved.cancellationFeePercent).toBe(10); // NULL → default
    expect(resolved.cancellationFeeEnabled).toBe(false); // explicit override
  });

  it('returns defaults for a null universityId without touching the repo', async () => {
    const { svc, settingsRepo } = makeService();

    const resolved = await svc.resolve(null);

    expect(resolved.p2pFeePercent).toBe(2.5);
    expect(settingsRepo.findOne).not.toHaveBeenCalled();
  });

  it('serves the second read from cache (single repo hit)', async () => {
    const { svc, settingsRepo } = makeService({ settingsRow: null });

    await svc.resolve('u1');
    await svc.resolve('u1');

    expect(settingsRepo.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('UniversitySettingsService.updateSettings', () => {
  it('creates the override row on first write and busts the cache', async () => {
    const { svc, settingsRepo, cache } = makeService({ settingsRow: null });

    // Prime the cache so the bust is observable.
    await svc.resolve('u1');
    const saved = await svc.updateSettings('u1', { p2pFeePercent: 4 });

    expect(saved.universityId).toBe('u1');
    expect(saved.p2pFeePercent).toBe(4);
    expect(settingsRepo.save).toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith('university_settings:u1');
  });

  it('touches only the keys present; explicit null clears an override', async () => {
    const row: any = {
      id: 'us1',
      universityId: 'u1',
      p2pFeePercent: 5,
      vendorFeePercent: 3,
      cancellationFeePercent: 12,
      cancellationFeeEnabled: false,
    };
    const { svc } = makeService({ settingsRow: row });

    const saved = await svc.updateSettings('u1', {
      p2pFeePercent: null, // clear back to default
      cancellationFeeEnabled: true,
      // vendorFeePercent / cancellationFeePercent omitted → untouched
    });

    expect(saved.p2pFeePercent).toBeNull();
    expect(saved.vendorFeePercent).toBe(3);
    expect(saved.cancellationFeePercent).toBe(12);
    expect(saved.cancellationFeeEnabled).toBe(true);
  });

  it('404s for an unknown university', async () => {
    const { svc } = makeService({ universityExists: false });

    await expect(
      svc.updateSettings('nope', { p2pFeePercent: 4 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UniversitySettingsService drop points', () => {
  it('lists active-only by default, everything when asked', async () => {
    const { svc, dropPointRepo } = makeService();

    await svc.listDropPoints('u1');
    expect(dropPointRepo.find).toHaveBeenLastCalledWith({
      where: { universityId: 'u1', isActive: true },
      order: { name: 'ASC' },
    });

    await svc.listDropPoints('u1', true);
    expect(dropPointRepo.find).toHaveBeenLastCalledWith({
      where: { universityId: 'u1' },
      order: { name: 'ASC' },
    });
  });

  it('creates a drop point bound to the university', async () => {
    const { svc } = makeService();

    const created = await svc.createDropPoint('u1', {
      name: 'Main Gate',
      directions: 'Beside the security post',
    });

    expect(created.universityId).toBe('u1');
    expect(created.name).toBe('Main Gate');
    expect(created.isActive).toBeUndefined(); // DB default applies
  });

  it('updates only provided fields and 404s on unknown drop point', async () => {
    const existing: any = {
      id: 'dp1',
      universityId: 'u1',
      name: 'Main Gate',
      directions: 'Old note',
      isActive: true,
    };
    const { svc } = makeService({ dropPoint: existing });

    const updated = await svc.updateDropPoint('dp1', { isActive: false });
    expect(updated.isActive).toBe(false);
    expect(updated.name).toBe('Main Gate');
    expect(updated.directions).toBe('Old note');

    const { svc: svcMissing } = makeService({ dropPoint: null });
    await expect(
      svcMissing.updateDropPoint('nope', { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
