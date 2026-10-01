import { UsersService } from './users.service';
import { EscrowStatus } from '../../database/entities/escrow.entity';

/**
 * Account deletion zeroes the wallet (locked balance included), so every order
 * that still holds the buyer's money must block it — PENDING_CONFIRMATION too
 * (vendor confirmation / service time negotiation).
 */
describe('UsersService.checkCanDeleteAccount', () => {
  function makeService(activeCount: number) {
    const escrowRepo: any = { count: jest.fn(async () => activeCount) };
    // Only escrowRepo is touched by this method; skip the wide constructor.
    const svc = Object.create(UsersService.prototype) as UsersService;
    (svc as any).escrowRepo = escrowRepo;
    return { svc, escrowRepo };
  }

  it('counts pending_confirmation orders as active, as buyer and as seller', async () => {
    const { svc, escrowRepo } = makeService(0);
    await svc.checkCanDeleteAccount('u1');

    const where = escrowRepo.count.mock.calls[0][0].where;
    for (const clause of where) {
      expect(clause.status.value).toEqual(
        expect.arrayContaining([
          EscrowStatus.PENDING_CONFIRMATION,
          EscrowStatus.AWAITING_SELLER,
          EscrowStatus.SELLER_READY,
          EscrowStatus.DELIVERED,
          EscrowStatus.DISPUTED,
        ]),
      );
    }
    expect(where).toEqual([
      expect.objectContaining({ buyerId: 'u1' }),
      expect.objectContaining({ sellerId: 'u1' }),
    ]);
  });

  it('blocks deletion while any such order exists', async () => {
    const { svc } = makeService(1);
    await expect(svc.checkCanDeleteAccount('u1')).resolves.toMatchObject({
      canDelete: false,
      activeEscrowCount: 1,
    });
  });
});
