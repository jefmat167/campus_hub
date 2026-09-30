import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { hashRefreshJti } from '../../common/utils/refresh-token';
import { AccountType } from '../../database/entities/user.entity';

/**
 * Refresh-token binding. The old scheme stored bcrypt(fullJwt); bcrypt reads
 * only the first 72 bytes, and every JWT a user gets shares those (fixed
 * header + `{"sub":"<id>…`), so ANY of the user's refresh tokens matched —
 * rotation and logout revoked nothing — while registration hashed the bare
 * jti and so could never match. Now the stored value is SHA-256(jti).
 */
const SECRETS: Record<string, string> = {
  JWT_SECRET: 'test-access-secret-that-is-long-enough-000',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough-00',
};

function makeService() {
  const user: any = {
    id: '6f1c2b0e-8f5d-4a55-9d3e-0a1b2c3d4e5f',
    email: 'ada@unilag.edu.ng',
    universityId: 'u1',
    accountType: AccountType.STUDENT,
    refreshTokenHash: null,
  };
  const userRepo: any = {
    findOne: jest.fn(async ({ where }: any) => (where.id === user.id ? user : null)),
    save: jest.fn(async (u: any) => u),
    update: jest.fn(async (_id: string, patch: any) => Object.assign(user, patch)),
  };
  const configService: any = {
    get: (key: string, fallback?: unknown) => SECRETS[key] ?? fallback,
  };
  const jwtService = new JwtService({});
  const cacheManager: any = { set: jest.fn(async () => undefined) };

  const svc = new AuthService(
    userRepo,
    {} as any, // walletRepo
    {} as any, // passwordResetRepo
    jwtService,
    configService,
    {} as any, // universitiesService
    {} as any, // vendorsService
    {} as any, // emailService
    {} as any, // usersService
    {} as any, // dataSource
    cacheManager,
    {} as any, // authQueue
  );

  /** Issue a pair the way login/refresh do: sign with a jti, store its hash. */
  async function issue(jti: string) {
    const tokens = await (svc as any).generateTokens(user, jti);
    user.refreshTokenHash = hashRefreshJti(jti);
    return tokens;
  }

  return { svc, user, userRepo, jwtService, issue };
}

describe('AuthService.refreshTokens — rotation + revocation', () => {
  it('a registration-style token (jti hashed before signing) refreshes', async () => {
    const { svc, issue } = makeService();
    const { refreshToken } = await issue('jti-register');

    const next = await svc.refreshTokens(refreshToken);
    expect(next.accessToken).toBeTruthy();
    expect(next.refreshToken).not.toBe(refreshToken);
  });

  it('rotation: the presented token stops working once it has been used', async () => {
    const { svc, issue } = makeService();
    const { refreshToken: first } = await issue('jti-1');

    const second = await svc.refreshTokens(first);
    await expect(svc.refreshTokens(first)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.refreshTokens(second.refreshToken)).resolves.toBeDefined();
  });

  it('only the most recently issued token is live (the 72-byte bcrypt regression)', async () => {
    const { svc, issue } = makeService();
    const older = await issue('jti-old');
    await issue('jti-new');

    // The old scheme's hash of the NEW token matches the OLD one too:
    const oldScheme = await bcrypt.hash((await issue('jti-new')).refreshToken, 4);
    expect(await bcrypt.compare(older.refreshToken, oldScheme)).toBe(true);

    await expect(svc.refreshTokens(older.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('logout clears the stored hash with null (undefined is dropped from an UPDATE)', async () => {
    const { svc, userRepo, user, issue } = makeService();
    const { refreshToken } = await issue('jti-logout');

    await svc.logout(user.id);

    expect(userRepo.update).toHaveBeenCalledWith(user.id, { refreshTokenHash: null });
    await expect(svc.refreshTokens(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('a non-JWT string is a 401, not a parse crash', async () => {
    const { svc } = makeService();
    await expect(svc.refreshTokens('not-a-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(svc.refreshTokens('a.b.c')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an admin refresh token (same secret, different plane)', async () => {
    const { svc, user, jwtService } = makeService();
    const adminToken = await jwtService.signAsync(
      { sub: user.id, type: 'admin', jti: 'jti-admin' },
      { secret: SECRETS.JWT_REFRESH_SECRET, expiresIn: '7d' },
    );
    user.refreshTokenHash = hashRefreshJti('jti-admin');

    await expect(svc.refreshTokens(adminToken)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const { svc, user, jwtService } = makeService();
    const forged = await jwtService.signAsync(
      { sub: user.id, jti: 'jti-forged' },
      { secret: 'some-other-secret-entirely-000000000000', expiresIn: '7d' },
    );
    user.refreshTokenHash = hashRefreshJti('jti-forged');

    await expect(svc.refreshTokens(forged)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
