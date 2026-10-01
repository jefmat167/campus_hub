import { EmailService } from './email.service';
import { EmailVerificationType } from '../../database/entities/email-verification.entity';

/**
 * The verification and password-reset links open pages THIS server renders,
 * so they must be built from PUBLIC_BASE_URL (the deployed origin) — never
 * from FRONTEND_URL, and never from wherever the process listens. A deployed
 * server that still had a localhost FRONTEND_URL used to email localhost links.
 */
function makeService(env: Record<string, string>) {
  const configService = {
    getOrThrow: (key: string) => {
      if (env[key] === undefined) throw new Error(`${key} is not set`);
      return env[key];
    },
    get: (key: string, fallback?: unknown) => env[key] ?? fallback,
  };
  const resendService = {
    sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'test' }),
  };
  const svc = new EmailService({} as any, {} as any, resendService as any, configService as any);
  return { svc, resendService };
}

describe('EmailService — links to server-rendered pages', () => {
  const env = {
    PUBLIC_BASE_URL: 'https://api.campushub.ng/',
    // Deliberately the old, wrong value: the links must not come from here.
    FRONTEND_URL: 'http://localhost:7000/api/v1',
  };

  it('builds the password-reset link on the public origin plus the API prefix', async () => {
    const { svc, resendService } = makeService(env);

    await svc.sendPasswordResetEmail('ada@example.com', 't0k3n', 'Ada');

    const sent = resendService.sendEmail.mock.calls[0][0];
    expect(sent.template).toBe('resetPassword');
    expect(sent.context.resetUrl).toBe(
      'https://api.campushub.ng/api/v1/auth/reset-password?token=t0k3n',
    );
    expect(sent.context.resetUrl).not.toContain('localhost');
  });

  it('builds the email-verification link the same way', async () => {
    const { svc, resendService } = makeService(env);

    await (svc as any).sendVerificationEmailInternal(
      'ada@example.com',
      EmailVerificationType.PERSONAL,
      't0k3n',
      'Ada',
    );

    const sent = resendService.sendEmail.mock.calls[0][0];
    expect(sent.template).toBe('verifyEmail');
    expect(sent.context.verifyUrl).toBe(
      'https://api.campushub.ng/api/v1/auth/verify-email?token=t0k3n',
    );
    expect(sent.context.verifyUrl).not.toContain('localhost');
  });

  it('refuses to start with a PUBLIC_BASE_URL that already carries a path', () => {
    expect(() => makeService({ ...env, PUBLIC_BASE_URL: 'http://localhost:7000/api/v1' })).toThrow(
      /origin only/,
    );
  });

  it('refuses to start without PUBLIC_BASE_URL', () => {
    expect(() => makeService({ FRONTEND_URL: env.FRONTEND_URL })).toThrow(/PUBLIC_BASE_URL/);
  });
});
