/**
 * The global route prefix (`app.setGlobalPrefix`). Shared so that code which
 * builds absolute links to this server's own routes (email verification,
 * password reset) never hardcodes it separately from `main.ts`.
 */
export const API_GLOBAL_PREFIX = 'api/v1';
