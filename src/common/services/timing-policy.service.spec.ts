import { TimingPolicyService } from './timing-policy.service';

/**
 * TimingPolicyService: env-backed defaults, env overrides, and the v1
 * contract that the context argument doesn't change the answer (the seam
 * for per-category policies later).
 */
describe('TimingPolicyService', () => {
  it('resolves the documented defaults when no env overrides exist', () => {
    const config: any = { get: (_k: string, d: any) => d };
    const svc = new TimingPolicyService(config);

    expect(svc.resolve()).toEqual({
      confirmationHours: 24,
      fulfillmentHours: 72,
      disputeWindowMinutes: 1440,
      agreementHours: 72,
      appointmentHorizonDays: 14,
      noShowGraceMinutes: 30,
      appointmentBackstopHours: 24,
      proposalExpiryHours: 48,
      offerLockHours: 24,
    });
  });

  it('honours env overrides (numeric strings included)', () => {
    const env: Record<string, string> = {
      ESCROW_FULFILLMENT_HOURS: '48',
      SERVICE_NO_SHOW_GRACE_MINUTES: '15',
    };
    const config: any = { get: (k: string, d: any) => env[k] ?? d };
    const svc = new TimingPolicyService(config);

    const policy = svc.resolve();
    expect(policy.fulfillmentHours).toBe(48);
    expect(policy.noShowGraceMinutes).toBe(15);
    expect(policy.confirmationHours).toBe(24); // untouched default
  });

  it('ignores the context in v1 — same policy for every market/category', () => {
    const config: any = { get: (_k: string, d: any) => d };
    const svc = new TimingPolicyService(config);

    expect(svc.resolve({ market: 'vendor', category: 'food' })).toBe(
      svc.resolve({ market: 'p2p' }),
    );
  });
});
