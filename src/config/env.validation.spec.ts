import { envValidationSchema } from './env.validation';

/** The minimum any environment needs besides the key under test. */
const baseEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/campus_hub',
  JWT_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  ANONYMOUS_SECRET: 'c'.repeat(32),
};

const validate = (env: Record<string, unknown>) =>
  envValidationSchema.validate(env, { allowUnknown: true, abortEarly: false });

describe('envValidationSchema — PUBLIC_BASE_URL', () => {
  it('is required, with a message that names it', () => {
    const { error } = validate(baseEnv);
    expect(error).toBeDefined();
    expect(error!.message).toContain('PUBLIC_BASE_URL');
  });

  it('rejects a value that includes the API prefix', () => {
    const { error } = validate({ ...baseEnv, PUBLIC_BASE_URL: 'http://localhost:7000/api/v1' });
    expect(error).toBeDefined();
    expect(error!.message).toMatch(/origin only/);
  });

  it('accepts an origin and normalises a trailing slash', () => {
    const { error, value } = validate({ ...baseEnv, PUBLIC_BASE_URL: 'https://api.campushub.ng/' });
    expect(error).toBeUndefined();
    expect(value.PUBLIC_BASE_URL).toBe('https://api.campushub.ng');
  });

  it('leaves FRONTEND_URL optional but requires it to be a URL when set', () => {
    expect(validate({ ...baseEnv, PUBLIC_BASE_URL: 'http://localhost:7000' }).error).toBeUndefined();
    expect(
      validate({ ...baseEnv, PUBLIC_BASE_URL: 'http://localhost:7000', FRONTEND_URL: 'not a url' }).error,
    ).toBeDefined();
  });
});
