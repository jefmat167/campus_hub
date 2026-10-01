import { API_GLOBAL_PREFIX } from '../constants/api';

/**
 * Links that land on pages THIS server renders (email verification, password
 * reset) must be built from the server's public origin — never from the host
 * the process happens to listen on (localhost in dev, an internal address
 * behind a proxy in prod). `PUBLIC_BASE_URL` carries that origin.
 *
 * It is scheme + host (+ port) only. The `/api/v1` prefix is added here from
 * `API_GLOBAL_PREFIX`, so an env value that already includes a path is
 * rejected rather than silently producing `/api/v1/api/v1/...` links.
 */
export function normalizePublicBaseUrl(raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `PUBLIC_BASE_URL must be an absolute http(s) URL such as https://api.campushub.ng, got "${String(raw)}"`,
    );
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`PUBLIC_BASE_URL must use http or https, got "${String(raw)}"`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `PUBLIC_BASE_URL must be the public origin only (e.g. https://api.campushub.ng) — ` +
        `the /${API_GLOBAL_PREFIX} prefix is added by the server; got "${String(raw)}"`,
    );
  }
  return url.origin;
}

/**
 * Absolute URL of one of this server's own routes, e.g.
 * `publicApiUrl('https://api.campushub.ng', 'auth/verify-email', { token })`
 * → `https://api.campushub.ng/api/v1/auth/verify-email?token=…`.
 */
export function publicApiUrl(
  baseUrl: string,
  routePath: string,
  query: Record<string, string> = {},
): string {
  const path = routePath.replace(/^\/+/, '');
  const qs = new URLSearchParams(query).toString();
  return `${baseUrl}/${API_GLOBAL_PREFIX}/${path}${qs ? `?${qs}` : ''}`;
}
