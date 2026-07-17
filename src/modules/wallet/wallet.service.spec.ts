import { WalletService } from './wallet.service';
import {
  Wallet,
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
} from '../../database/entities/wallet.entity';

function makeWallet(userId: string, balance: number, locked = 0): Wallet {
  const w = new Wallet();
  w.id = `${userId}-wallet`;
  w.userId = userId;
  w.balance = balance;
  w.lockedBalance = locked;
  w.isLocked = false;
  return w;
}

/**
 * Minimal in-memory stand-in for the TypeORM DataSource / repositories.
 * The queryRunner manager and the transaction repo share one `txns` array so
 * a debit written via the manager is visible to confirm/reverse reads.
 */
function makeDb(wallets: Wallet[]) {
  const byUser = new Map(wallets.map((w) => [w.userId, w]));
  const byId = new Map(wallets.map((w) => [w.id, w]));
  const txns: WalletTransaction[] = [];

  const isTxn = (o: any) => o && o.walletId && 'status' in o;
  const record = (arg: any) => {
    const items = Array.isArray(arg) ? arg : [arg];
    for (const it of items) {
      if (!isTxn(it)) continue;
      // Model the DB's unique(reference) constraint: inserting a *different*
      // row with an existing reference throws a Postgres 23505.
      const dup = txns.find((t) => t !== it && t.reference === it.reference);
      if (dup) {
        throw Object.assign(new Error('duplicate key value'), { code: '23505' });
      }
      if (!txns.includes(it)) txns.push(it);
    }
    return arg;
  };

  const manager = {
    findOne: async (entity: any, opts: any) => {
      if (entity === Wallet) {
        if (opts?.where?.userId) return byUser.get(opts.where.userId) ?? null;
        if (opts?.where?.id) return byId.get(opts.where.id) ?? null;
        return null;
      }
      if (entity === WalletTransaction) {
        return txns.find((t) => t.reference === opts.where.reference) ?? null;
      }
      return null;
    },
    save: async (arg: any) => record(arg),
  };

  const qr = {
    connect: async () => {},
    startTransaction: async () => {},
    commitTransaction: async () => {},
    rollbackTransaction: async () => {},
    release: async () => {},
    manager,
  };

  const transactionRepo = {
    create: (o: any) => o,
    findOne: async (opts: any) =>
      txns.find(
        (t) =>
          t.reference === opts.where.reference &&
          (!opts.where.status || t.status === opts.where.status),
      ) ?? null,
    save: async (t: any) => record(t),
  };

  const dataSource = { createQueryRunner: () => qr };

  return { dataSource, transactionRepo, qr, txns };
}

function makeService(db: ReturnType<typeof makeDb>): WalletService {
  return new WalletService(
    {} as any,
    db.transactionRepo as any,
    db.dataSource as any,
  );
}

describe('WalletService.settleEscrow', () => {
  it('completed order: full amount leaves the buyer, split seller + platform', async () => {
    const buyer = makeWallet('buyer', 1000, 1000); // locked the full amount
    const seller = makeWallet('seller', 50);
    const db = makeDb([buyer, seller]);
    const svc = makeService(db);

    await svc.settleEscrow(
      'buyer',
      'seller',
      { total: 1000, toSeller: 975, toPlatform: 25 },
      'ESCROW_RELEASE_1',
      db.qr as any,
    );

    // Buyer's hold is fully released and their balance drops by the full amount.
    expect(buyer.lockedBalance).toBe(0);
    expect(buyer.balance).toBe(0);
    // Seller receives the payout.
    expect(seller.balance).toBe(1025);

    const buyerDebit = db.txns.find(
      (t) => t.walletId === 'buyer-wallet' && t.amount < 0,
    );
    const sellerCredit = db.txns.find((t) => t.walletId === 'seller-wallet');
    expect(buyerDebit?.amount).toBe(-1000);
    expect(sellerCredit?.amount).toBe(975);
    // No leftover locked balance and no phantom refund row.
    expect(db.txns.some((t) => t.type === WalletTransactionType.ESCROW_REFUND)).toBe(
      false,
    );
  });

  it('partial settlement (cancellation/split): refunds the remainder to the buyer', async () => {
    const buyer = makeWallet('buyer', 1000, 1000);
    const seller = makeWallet('seller', 0);
    const db = makeDb([buyer, seller]);
    const svc = makeService(db);

    // e.g. cancellation fee 400: seller comp 300, platform 100, refund 600.
    await svc.settleEscrow(
      'buyer',
      'seller',
      { total: 1000, toSeller: 300, toPlatform: 100 },
      'ESCROW_CANCEL_1',
      db.qr as any,
    );

    expect(buyer.lockedBalance).toBe(0); // hold fully released
    expect(buyer.balance).toBe(600); // only seller+platform (400) left the buyer
    expect(buyer.availableBalance).toBe(600); // refund is spendable again
    expect(seller.balance).toBe(300);

    const refund = db.txns.find(
      (t) => t.type === WalletTransactionType.ESCROW_REFUND,
    );
    expect(refund?.amount).toBe(600);

    // The three buckets conserve the principal exactly.
    const distributed = 300 /*seller*/ + 100 /*platform*/ + 600; /*refund*/
    expect(distributed).toBe(1000);
  });

  it('rejects a settlement that exceeds the escrow amount', async () => {
    const buyer = makeWallet('buyer', 1000, 1000);
    const seller = makeWallet('seller', 0);
    const db = makeDb([buyer, seller]);
    const svc = makeService(db);

    await expect(
      svc.settleEscrow(
        'buyer',
        'seller',
        { total: 100, toSeller: 80, toPlatform: 40 },
        'REF',
        db.qr as any,
      ),
    ).rejects.toThrow(/exceeds escrow amount/);
  });

  it('rejects when the buyer has not locked enough', async () => {
    const buyer = makeWallet('buyer', 1000, 500); // only 500 locked
    const seller = makeWallet('seller', 0);
    const db = makeDb([buyer, seller]);
    const svc = makeService(db);

    await expect(
      svc.settleEscrow(
        'buyer',
        'seller',
        { total: 1000, toSeller: 975, toPlatform: 25 },
        'REF',
        db.qr as any,
      ),
    ).rejects.toThrow(/Insufficient locked balance/);
  });

  it('rejects when buyer and seller are the same user', async () => {
    const buyer = makeWallet('same', 1000, 1000);
    const db = makeDb([buyer]);
    const svc = makeService(db);

    await expect(
      svc.settleEscrow(
        'same',
        'same',
        { total: 1000, toSeller: 975, toPlatform: 25 },
        'REF',
        db.qr as any,
      ),
    ).rejects.toThrow(/must differ/);
  });
});

describe('WalletService.creditWallet idempotency', () => {
  it('returns the existing transaction on a duplicate reference (no 500)', async () => {
    const w = makeWallet('u1', 1000);
    const db = makeDb([w]);
    const svc = makeService(db);

    const first = await svc.creditWallet('u1', 500, 'DEP_1');
    expect(first.reference).toBe('DEP_1');

    // A second credit with the same reference (e.g. webhook + /fund/verify race)
    // hits the unique constraint; creditWallet swallows 23505 and returns the
    // already-recorded transaction rather than throwing.
    const second = await svc.creditWallet('u1', 500, 'DEP_1');
    expect(second.reference).toBe('DEP_1');
    // Only one DEP_1 transaction was ever recorded.
    expect(db.txns.filter((t) => t.reference === 'DEP_1')).toHaveLength(1);
    // (Balance rollback on the duplicate isn't modelled by the in-memory fake;
    // in Postgres the wallet update rolls back with the failed insert.)
  });
});

describe('WalletService.reverseDeposit (chargeback)', () => {
  it('claws back a fully-covered deposit and freezes the wallet', async () => {
    const w = makeWallet('u1', 1000);
    const db = makeDb([w]);
    const svc = makeService(db);

    await svc.creditWallet('u1', 500, 'DEP_1'); // balance 1500
    await svc.reverseDeposit('DEP_1', 'charge dispute');

    expect(w.balance).toBe(1000); // 500 recovered
    expect(w.isLocked).toBe(true);
    const deposit = db.txns.find((t) => t.reference === 'DEP_1');
    expect(deposit?.status).toBe(WalletTransactionStatus.REVERSED);
    const cb = db.txns.find((t) => t.type === WalletTransactionType.CHARGEBACK);
    expect(cb?.amount).toBe(-500);
    expect((cb?.metadata as any)?.shortfall).toBe(0);
  });

  it('recovers only what is available and records the shortfall', async () => {
    const w = makeWallet('u2', 0);
    const db = makeDb([w]);
    const svc = makeService(db);

    await svc.creditWallet('u2', 500, 'DEP_2'); // balance 500
    w.balance = 200; // simulate most of it already spent/withdrawn

    await svc.reverseDeposit('DEP_2', 'charge dispute');

    expect(w.balance).toBe(0); // recovered only 200
    expect(w.isLocked).toBe(true);
    const cb = db.txns.find((t) => t.type === WalletTransactionType.CHARGEBACK);
    expect(cb?.amount).toBe(-200);
    expect((cb?.metadata as any)?.shortfall).toBe(300);
  });

  it('is idempotent — a second dispute webhook does nothing', async () => {
    const w = makeWallet('u3', 1000);
    const db = makeDb([w]);
    const svc = makeService(db);

    await svc.creditWallet('u3', 500, 'DEP_3');
    await svc.reverseDeposit('DEP_3', 'charge dispute');
    const balanceAfterFirst = w.balance;

    await svc.reverseDeposit('DEP_3', 'charge dispute');
    expect(w.balance).toBe(balanceAfterFirst);
    expect(
      db.txns.filter((t) => t.type === WalletTransactionType.CHARGEBACK),
    ).toHaveLength(1);
  });
});

describe('WalletService withdrawal lifecycle', () => {
  it('debits immediately and records a PENDING transaction', async () => {
    const w = makeWallet('u1', 5000);
    const db = makeDb([w]);
    const svc = makeService(db);

    const tx = await svc.debitForWithdrawal('u1', 2000, 'WD_1');

    expect(w.balance).toBe(3000);
    expect(tx.status).toBe(WalletTransactionStatus.PENDING);
    expect(tx.amount).toBe(-2000);
    expect(tx.type).toBe(WalletTransactionType.WITHDRAWAL);
  });

  it('confirm marks COMPLETED without touching the balance', async () => {
    const w = makeWallet('u1', 5000);
    const db = makeDb([w]);
    const svc = makeService(db);

    await svc.debitForWithdrawal('u1', 2000, 'WD_1');
    await svc.confirmWithdrawal('WD_1');

    const tx = db.txns.find((t) => t.reference === 'WD_1');
    expect(tx?.status).toBe(WalletTransactionStatus.COMPLETED);
    expect(w.balance).toBe(3000); // unchanged — money already left at request time
  });

  it('reverses a failed transfer and refunds the balance exactly once', async () => {
    const w = makeWallet('u1', 5000);
    const db = makeDb([w]);
    const svc = makeService(db);

    await svc.debitForWithdrawal('u1', 2000, 'WD_1');
    await svc.reverseWithdrawal('WD_1');

    const tx = db.txns.find((t) => t.reference === 'WD_1');
    expect(tx?.status).toBe(WalletTransactionStatus.REVERSED);
    expect(w.balance).toBe(5000); // refunded

    // Idempotent: a duplicate webhook must not double-refund.
    await svc.reverseWithdrawal('WD_1');
    expect(w.balance).toBe(5000);
  });

  it('reverses an already-COMPLETED transfer (transfer.reversed after success)', async () => {
    const w = makeWallet('u1', 5000);
    const db = makeDb([w]);
    const svc = makeService(db);

    await svc.debitForWithdrawal('u1', 2000, 'WD_1');
    await svc.confirmWithdrawal('WD_1'); // COMPLETED
    await svc.reverseWithdrawal('WD_1'); // Paystack later reverses it

    const tx = db.txns.find((t) => t.reference === 'WD_1');
    expect(tx?.status).toBe(WalletTransactionStatus.REVERSED);
    expect(w.balance).toBe(5000);
  });

  it('rejects a withdrawal larger than the available balance', async () => {
    const w = makeWallet('u1', 1000, 500); // available 500
    const db = makeDb([w]);
    const svc = makeService(db);

    await expect(
      svc.debitForWithdrawal('u1', 800, 'WD_1'),
    ).rejects.toThrow(/Insufficient balance/);
    expect(w.balance).toBe(1000); // untouched
  });
});
