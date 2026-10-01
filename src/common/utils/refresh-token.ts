import { createHash, timingSafeEqual } from 'crypto';

/**
 * Refresh-token binding. We store a SHA-256 of the refresh token's `jti`, not a
 * bcrypt of the whole JWT: bcrypt only reads the first 72 bytes, and every JWT a
 * user is issued shares its first 72 bytes (fixed header + `{"sub":"<id>...`), so
 * a bcrypt of the token matched ALL of that user's refresh tokens — rotation and
 * revocation were no-ops. The jti is a random UUID bound into the signed token,
 * so a fast hash is enough (no password-style stretching needed).
 */
export function hashRefreshJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

/** Constant-time check of a verified token's jti against the stored hash. */
export function refreshJtiMatches(
  jti: unknown,
  storedHash: string | null | undefined,
): boolean {
  if (typeof jti !== 'string' || !jti || !storedHash) return false;
  const actual = Buffer.from(hashRefreshJti(jti), 'hex');
  const expected = Buffer.from(storedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
