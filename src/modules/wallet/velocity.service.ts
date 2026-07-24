import {
  Injectable,
  Inject,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { EntityManager, Repository } from 'typeorm';
import {
  WalletTransaction,
  WalletTransactionType,
  WalletTransactionStatus,
} from '../../database/entities/wallet.entity';
import {
  TransactionCap,
  TransactionCapType,
  TransactionCapPeriod,
} from '../../database/entities/transaction-cap.entity';
import { User, VerificationTier } from '../../database/entities/user.entity';
import { toKobo, toNaira } from '../../common/utils/money';

/** { tier: { capType: { period: amountNaira | null } } } — null = unlimited. */
type CapsMap = Partial<
  Record<
    VerificationTier,
    Partial<
      Record<TransactionCapType, Partial<Record<TransactionCapPeriod, number | null>>>
    >
  >
>;

/**
 * Enforces cumulative / velocity transaction caps (per-tier daily ceilings on
 * escrow spend and withdrawals) on top of the per-transaction tier limits.
 *
 * Enforcement is service-layer, not a guard: the two money-out choke points
 * (`WalletService.lockFunds` for escrow spend, `WalletService.debitForWithdrawal`
 * for withdrawals) already hold a pessimistic write lock on the user's wallet
 * row, which serialises all of that user's money moves. `assertWithinCap` must
 * be called inside that same locked transaction so the windowed SUM it reads is
 * consistent with concurrent writers (no TOCTOU race).
 *
 * All comparison math is done in integer kobo — a raw `SUM` bypasses
 * `KoboColumnTransformer` and returns raw kobo.
 */
@Injectable()
export class VelocityService {
  private readonly logger = new Logger(VelocityService.name);

  private static readonly CAPS_CACHE_KEY = 'transaction_caps:map';
  private static readonly CAPS_CACHE_TTL_MS = 300_000; // 5 min backstop; busted on admin update

  // Trailing rolling windows, expressed as Postgres interval literals. These
  // are STATIC (never user-derived), so interpolating them into SQL is safe.
  private static readonly WINDOW_SQL: Record<TransactionCapPeriod, string> = {
    [TransactionCapPeriod.DAILY]: '24 hours',
    [TransactionCapPeriod.WEEKLY]: '7 days',
  };

  constructor(
    @InjectRepository(TransactionCap)
    private readonly capRepo: Repository<TransactionCap>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /**
   * Throw a 403 if this money-out event would push the user over their cap for
   * the given cap type. Unconfigured or NULL (unlimited) caps are a no-op.
   *
   * Must run inside `manager`'s transaction, after the wallet-row lock.
   */
  async assertWithinCap(
    manager: EntityManager,
    params: {
      userId: string;
      walletId: string;
      capType: TransactionCapType;
      incomingNaira: number;
    },
  ): Promise<void> {
    const { userId, walletId, capType, incomingNaira } = params;

    // Resolve tier fresh from the DB — never trust a possibly-stale JWT tier.
    const user = await manager.findOne(User, {
      where: { id: userId },
      select: ['id', 'verificationTier'],
    });
    const tier = user?.verificationTier ?? VerificationTier.NONE;

    // v1 enforces the DAILY window only.
    const period = TransactionCapPeriod.DAILY;

    const caps = await this.getCaps();
    const capNaira = caps[tier]?.[capType]?.[period];
    if (capNaira === null || capNaira === undefined) {
      return; // unlimited or unconfigured → no cap to enforce
    }

    const capKobo = toKobo(capNaira);
    const spentKobo = await this.getWindowSpendKobo(
      manager,
      walletId,
      capType,
      period,
    );
    const incomingKobo = toKobo(incomingNaira);

    if (spentKobo + incomingKobo > capKobo) {
      const remainingKobo = Math.max(0, capKobo - spentKobo);
      throw new ForbiddenException({
        message: `This would exceed your ${period} ${capType} limit of ₦${capNaira.toLocaleString()}. You have used ₦${toNaira(
          spentKobo,
        ).toLocaleString()} in the last ${VelocityService.WINDOW_SQL[period]}.`,
        limit: capNaira,
        amount: incomingNaira,
        currentTier: tier,
        upgradeRequired: true,
        // Additive fields — clients keying off the per-transaction limit error
        // shape keep working; these distinguish a cumulative breach.
        period,
        capType,
        spentSoFar: toNaira(spentKobo),
        remaining: toNaira(remainingKobo),
      });
    }
  }

  /**
   * Money that has left (or is committed to leave) the wallet within the
   * rolling window, in integer kobo (a positive figure).
   *
   * - spend: gross new escrow commitments = ESCROW_HOLD debits. (Summing the
   *   settlement ESCROW_RELEASE/ESCROW_REFUND rows too would double-count; and
   *   counting only holds keeps a placed-then-cancelled churn from resetting
   *   the allowance within the window.)
   * - withdrawal: WITHDRAWAL rows still in play (PENDING or COMPLETED),
   *   excluding REVERSED/FAILED (money came back / never left) and admin
   *   adjustments (ADMIN_ADJ_*).
   */
  private async getWindowSpendKobo(
    manager: EntityManager,
    walletId: string,
    capType: TransactionCapType,
    period: TransactionCapPeriod,
  ): Promise<number> {
    const intervalSql = VelocityService.WINDOW_SQL[period];

    const qb = manager
      .createQueryBuilder(WalletTransaction, 't')
      .select('COALESCE(SUM(t.amount), 0)', 'sum')
      .where('t.walletId = :walletId', { walletId })
      .andWhere(`t.createdAt >= NOW() - INTERVAL '${intervalSql}'`);

    if (capType === TransactionCapType.SPEND) {
      qb.andWhere('t.type = :type', {
        type: WalletTransactionType.ESCROW_HOLD,
      });
    } else {
      qb.andWhere('t.type = :type', {
        type: WalletTransactionType.WITHDRAWAL,
      })
        .andWhere('t.status NOT IN (:...excluded)', {
          excluded: [
            WalletTransactionStatus.REVERSED,
            WalletTransactionStatus.FAILED,
          ],
        })
        .andWhere("t.reference NOT LIKE 'ADMIN_ADJ_%'");
    }

    const row = await qb.getRawOne<{ sum: string | number }>();
    // Raw SUM bypasses KoboColumnTransformer → raw kobo. Money-out rows are
    // stored signed-negative, so negate to get a positive spent figure.
    const rawKobo = Number(row?.sum ?? 0);
    return Math.max(0, Math.round(-rawKobo));
  }

  /** All caps as a nested lookup, cached (busted on admin update). */
  async getCaps(): Promise<CapsMap> {
    const cached = await this.cache.get<CapsMap>(VelocityService.CAPS_CACHE_KEY);
    if (cached) return cached;

    const rows = await this.capRepo.find();
    const map: CapsMap = {};
    for (const row of rows) {
      const byType = (map[row.tier] ??= {});
      const byPeriod = (byType[row.capType] ??= {});
      byPeriod[row.period] = row.amount; // Naira or null (unlimited)
    }

    await this.cache.set(
      VelocityService.CAPS_CACHE_KEY,
      map,
      VelocityService.CAPS_CACHE_TTL_MS,
    );
    return map;
  }

  private async invalidateCache(): Promise<void> {
    await this.cache.del(VelocityService.CAPS_CACHE_KEY);
  }

  /** Admin: list every cap row (for the management UI). */
  async listCaps(): Promise<TransactionCap[]> {
    return this.capRepo.find({
      order: { tier: 'ASC', capType: 'ASC', period: 'ASC' },
    });
  }

  /**
   * Admin: set a cap figure (naira, or null for unlimited). Upserts the
   * (tier, capType, period) row and busts the cache so the change applies at
   * once.
   */
  async updateCap(
    tier: VerificationTier,
    capType: TransactionCapType,
    period: TransactionCapPeriod,
    amountNaira: number | null,
  ): Promise<TransactionCap> {
    let cap = await this.capRepo.findOne({ where: { tier, capType, period } });
    if (cap) {
      cap.amount = amountNaira;
    } else {
      cap = this.capRepo.create({ tier, capType, period, amount: amountNaira });
    }
    const saved = await this.capRepo.save(cap);
    await this.invalidateCache();
    this.logger.log(
      `Transaction cap updated: ${tier}/${capType}/${period} = ${
        amountNaira === null ? 'unlimited' : `₦${amountNaira}`
      }`,
    );
    return saved;
  }
}
