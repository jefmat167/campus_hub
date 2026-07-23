import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TransactionPinService } from './transaction-pin.service';

const PIN = '135790';

function makeService() {
  const users = new Map<string, any>();
  const userRepo: any = {
    findOne: jest.fn(async ({ where }: any) => users.get(where.id) ?? null),
    update: jest.fn(async ({ id }: any, patch: any) => {
      const u = users.get(id);
      if (u) Object.assign(u, patch);
      return { affected: u ? 1 : 0 };
    }),
  };
  const smsService: any = {
    sendOtp: jest.fn(async () => ({ pinId: 'p', message: 'ok', otp: '654321' })),
    verifyOtp: jest.fn(async () => true),
  };
  const svc = new TransactionPinService(userRepo, smsService);
  return { svc, userRepo, smsService, users };
}

/** Assert a promise rejects with an HttpException carrying `{ code }`. */
async function expectCode(promise: Promise<unknown>, code: string) {
  const err: any = await promise.then(
    () => {
      throw new Error('expected rejection');
    },
    (e) => e,
  );
  expect(err.getResponse()).toMatchObject({ code });
  return err;
}

describe('TransactionPinService.verifyForTransaction', () => {
  it('rejects when no PIN is set (PIN_NOT_SET)', async () => {
    const { svc, users } = makeService();
    users.set('u1', { id: 'u1', pinHash: null, pinAttempts: 0, pinLockedUntil: null });
    await expectCode(svc.verifyForTransaction('u1', PIN), 'PIN_NOT_SET');
  });

  it('accepts the correct PIN and clears prior failed attempts', async () => {
    const { svc, users, userRepo } = makeService();
    users.set('u1', {
      id: 'u1',
      pinHash: await bcrypt.hash(PIN, 12),
      pinAttempts: 2,
      pinLockedUntil: null,
    });
    await expect(svc.verifyForTransaction('u1', PIN)).resolves.toBeUndefined();
    expect(userRepo.update).toHaveBeenCalledWith(
      { id: 'u1' },
      { pinAttempts: 0, pinLockedUntil: null },
    );
  });

  it('rejects a wrong PIN and increments the attempt counter', async () => {
    const { svc, users, userRepo } = makeService();
    users.set('u1', {
      id: 'u1',
      pinHash: await bcrypt.hash(PIN, 12),
      pinAttempts: 0,
      pinLockedUntil: null,
    });
    await expectCode(svc.verifyForTransaction('u1', '000000'), 'PIN_INVALID');
    expect(userRepo.update).toHaveBeenCalledWith({ id: 'u1' }, { pinAttempts: 1 });
  });

  it('locks after the 5th consecutive failure', async () => {
    const { svc, users, userRepo } = makeService();
    users.set('u1', {
      id: 'u1',
      pinHash: await bcrypt.hash(PIN, 12),
      pinAttempts: 4, // this is the 5th
      pinLockedUntil: null,
    });
    await expectCode(svc.verifyForTransaction('u1', '000000'), 'PIN_LOCKED');
    const patch = userRepo.update.mock.calls.at(-1)[1];
    expect(patch.pinAttempts).toBe(0);
    expect(patch.pinLockedUntil).toBeInstanceOf(Date);
    expect(patch.pinLockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('blocks while locked, even with the correct PIN', async () => {
    const { svc, users } = makeService();
    users.set('u1', {
      id: 'u1',
      pinHash: await bcrypt.hash(PIN, 12),
      pinAttempts: 0,
      pinLockedUntil: new Date(Date.now() + 60_000),
    });
    await expectCode(svc.verifyForTransaction('u1', PIN), 'PIN_LOCKED');
  });

  it('treats a malformed PIN as 400 without burning an attempt', async () => {
    const { svc, users, userRepo } = makeService();
    users.set('u1', {
      id: 'u1',
      pinHash: await bcrypt.hash(PIN, 12),
      pinAttempts: 0,
      pinLockedUntil: null,
    });
    await expectCode(svc.verifyForTransaction('u1', '12ab'), 'PIN_INVALID_FORMAT');
    expect(userRepo.update).not.toHaveBeenCalled();
  });

  it('requires a PIN to be supplied', async () => {
    const { svc, users } = makeService();
    users.set('u1', {
      id: 'u1',
      pinHash: await bcrypt.hash(PIN, 12),
      pinAttempts: 0,
      pinLockedUntil: null,
    });
    await expectCode(svc.verifyForTransaction('u1', undefined), 'PIN_REQUIRED');
  });
});

describe('TransactionPinService management', () => {
  it('setPin requires the correct account password', async () => {
    const { svc, users } = makeService();
    users.set('u1', {
      id: 'u1',
      passwordHash: await bcrypt.hash('pw', 12),
      pinHash: null,
    });
    await expect(svc.setPin('u1', 'wrong', PIN)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(svc.setPin('u1', 'pw', PIN)).resolves.toBeUndefined();
    expect(users.get('u1').pinHash).toBeTruthy();
  });

  it('setPin refuses when a PIN already exists', async () => {
    const { svc, users } = makeService();
    users.set('u1', {
      id: 'u1',
      passwordHash: await bcrypt.hash('pw', 12),
      pinHash: await bcrypt.hash(PIN, 12),
    });
    await expect(svc.setPin('u1', 'pw', '246810')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('resetPin sets a new PIN on a valid OTP and rejects an invalid one', async () => {
    const { svc, users, smsService } = makeService();
    users.set('u1', { id: 'u1', phone: '2348000000000' });
    await expect(svc.resetPin('u1', '654321', '246810')).resolves.toBeUndefined();
    expect(users.get('u1').pinHash).toBeTruthy();

    smsService.verifyOtp.mockResolvedValueOnce(false);
    await expect(svc.resetPin('u1', 'bad', '246810')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
