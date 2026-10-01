import { normalizePublicBaseUrl, publicApiUrl } from './public-url';

describe('normalizePublicBaseUrl', () => {
  it('accepts an origin and strips a trailing slash', () => {
    expect(normalizePublicBaseUrl('https://api.campushub.ng/')).toBe('https://api.campushub.ng');
    expect(normalizePublicBaseUrl(' http://localhost:7000 ')).toBe('http://localhost:7000');
    expect(normalizePublicBaseUrl('http://165.227.130.10')).toBe('http://165.227.130.10');
  });

  it('rejects a value that already carries the API prefix or any path', () => {
    expect(() => normalizePublicBaseUrl('http://localhost:7000/api/v1')).toThrow(/origin only/);
    expect(() => normalizePublicBaseUrl('https://api.campushub.ng/auth')).toThrow(/origin only/);
    expect(() => normalizePublicBaseUrl('https://api.campushub.ng/?x=1')).toThrow(/origin only/);
  });

  it('rejects non-URLs, empty values and other schemes', () => {
    expect(() => normalizePublicBaseUrl('')).toThrow(/absolute http\(s\) URL/);
    expect(() => normalizePublicBaseUrl(undefined)).toThrow(/absolute http\(s\) URL/);
    expect(() => normalizePublicBaseUrl('api.campushub.ng')).toThrow(/absolute http\(s\) URL/);
    expect(() => normalizePublicBaseUrl('http://http://165.227.130.10')).toThrow(/origin only/);
    expect(() => normalizePublicBaseUrl('ftp://api.campushub.ng')).toThrow(/http or https/);
  });
});

describe('publicApiUrl', () => {
  it('prefixes the route with /api/v1 and encodes the query', () => {
    expect(publicApiUrl('https://api.campushub.ng', 'auth/verify-email', { token: 'a b/c' })).toBe(
      'https://api.campushub.ng/api/v1/auth/verify-email?token=a+b%2Fc',
    );
    expect(publicApiUrl('http://localhost:7000', '/auth/reset-password')).toBe(
      'http://localhost:7000/api/v1/auth/reset-password',
    );
  });
});
