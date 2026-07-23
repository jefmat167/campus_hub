import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { EscrowStatus } from '../../database/entities/escrow.entity';
import { DeliveryCode } from '../../database/entities/delivery-code.entity';

/**
 * Focused on the delivery-code verification lockout (anti-brute-force on the
 * 4-digit code). The full escrow lifecycle isn't exercised here — only enough
 * of `verifyDeliveryCode` to cover wrong-guess counting, the 5-attempt lock,
 * lock-blocks-correct-code, and the happy path.
 */
function makeCode(overrides: Partial<DeliveryCode> = {}): DeliveryCode {
  const c = new DeliveryCode();
  c.id = 'dc1';
  c.escrowId = 'e1';
  c.code = '1234';
  c.validFrom = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
  c.validUntil = new Date(Date.now() + 60 * 60 * 1000); // 1h ahead
  c.isUsed = false;
  c.isInvalidated = false;
  c.verifyAttempts = 0;
  c.lockedUntil = null;
  return Object.assign(c, overrides);
}

function makeService(deliveryCode: DeliveryCode) {
  const escrow: any = {
    id: 'e1',
    sellerId: 's1',
    buyerId: 'b1',
    orderNumber: 'ORD-1',
    status: EscrowStatus.SELLER_READY,
  };
  const escrowRepo: any = { findOne: jest.fn(async () => escrow) };
  const deliveryCodeRepo: any = {
    findOne: jest.fn(async () => deliveryCode),
    save: jest.fn(async (c: any) => c),
  };
  const queryRunner: any = {
    connect: jest.fn(async () => {}),
    startTransaction: jest.fn(async () => {}),
    commitTransaction: jest.fn(async () => {}),
    rollbackTransaction: jest.fn(async () => {}),
    release: jest.fn(async () => {}),
    manager: { save: jest.fn(async (x: any) => x) },
  };
  const dataSource: any = { createQueryRunner: () => queryRunner };
  const escrowQueue: any = { add: jest.fn(async () => {}) };
  const config: any = { get: (_k: string, d: any) => d };

  // Constructor arg order per escrow.service.ts; only the deps used by
  // verifyDeliveryCode are real, the rest are stubs.
  const svc = new EscrowService(
    escrowRepo,
    {} as any,
    deliveryCodeRepo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    dataSource,
    escrowQueue,
    {} as any,
    {} as any,
    config,
  );
  return { svc, escrow, deliveryCode, deliveryCodeRepo, escrowQueue };
}

describe('EscrowService delivery-code verify lockout', () => {
  it('counts a wrong guess and reports remaining attempts', async () => {
    const code = makeCode();
    const { svc, deliveryCodeRepo } = makeService(code);

    await expect(
      svc.verifyDeliveryCode('e1', 's1', '0000'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(code.verifyAttempts).toBe(1);
    expect(deliveryCodeRepo.save).toHaveBeenCalled();
  });

  it('locks the code after the 5th wrong guess (and resets the counter)', async () => {
    const code = makeCode({ verifyAttempts: 4 }); // this is the 5th
    const { svc } = makeService(code);

    await expect(
      svc.verifyDeliveryCode('e1', 's1', '0000'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(code.lockedUntil).toBeInstanceOf(Date);
    expect(code.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(code.verifyAttempts).toBe(0);
  });

  it('blocks verification while locked, even with the correct code', async () => {
    const code = makeCode({ lockedUntil: new Date(Date.now() + 60_000) });
    const { svc } = makeService(code);

    await expect(
      svc.verifyDeliveryCode('e1', 's1', '1234'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts the correct code within the window and marks DELIVERED', async () => {
    const code = makeCode();
    const { svc, escrow, escrowQueue } = makeService(code);

    const result = await svc.verifyDeliveryCode('e1', 's1', '1234');

    expect(result.status).toBe(EscrowStatus.DELIVERED);
    expect(code.isUsed).toBe(true);
    expect(escrowQueue.add).toHaveBeenCalled(); // 24h auto-release scheduled
  });
});
