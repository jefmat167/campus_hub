import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { PaystackService } from './paystack.service';

const SECRET = 'sk_test_supersecret';

function makeService(): PaystackService {
  const config = {
    getOrThrow: (key: string) =>
      key === 'PAYSTACK_SECRET_KEY' ? SECRET : 'https://api.paystack.co',
  } as unknown as ConfigService;

  return new PaystackService({} as unknown as HttpService, config);
}

function sign(payload: Buffer): string {
  return crypto.createHmac('sha512', SECRET).update(payload).digest('hex');
}

describe('PaystackService.verifyWebhookSignature', () => {
  const service = makeService();

  it('accepts a signature computed over the exact raw bytes', () => {
    const payload = Buffer.from(
      JSON.stringify({ event: 'charge.success', data: { reference: 'X' } }),
    );
    expect(service.verifyWebhookSignature(payload, sign(payload))).toBe(true);
  });

  it('rejects when the body is mutated after signing', () => {
    const original = Buffer.from(JSON.stringify({ amount: 1000 }));
    const signature = sign(original);
    const tampered = Buffer.from(JSON.stringify({ amount: 999999 }));
    expect(service.verifyWebhookSignature(tampered, signature)).toBe(false);
  });

  it('rejects a re-serialized body with different key order (the old bug)', () => {
    // Paystack signs the bytes it sent. A body re-stringified with a different
    // key order yields a different HMAC — which is exactly why we must verify
    // over req.rawBody, not JSON.stringify(parsedBody).
    const sent = Buffer.from('{"amount":1000,"status":"success"}');
    const signature = sign(sent);
    const reserialized = Buffer.from('{"status":"success","amount":1000}');
    expect(service.verifyWebhookSignature(reserialized, signature)).toBe(false);
  });

  it('rejects an empty or malformed signature without throwing', () => {
    const payload = Buffer.from('{}');
    expect(service.verifyWebhookSignature(payload, '')).toBe(false);
    expect(service.verifyWebhookSignature(payload, 'deadbeef')).toBe(false);
  });
});
