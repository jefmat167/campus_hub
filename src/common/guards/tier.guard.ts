import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VerificationTier } from '../../database/entities/user.entity';
import {
  MIN_TIER_KEY,
  TIER_LEVELS,
  tierMeetsRequirement,
} from '../decorators/min-tier.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TIER_LIMIT_TABLES, TierLimitType } from '../constants/tier-limits';
import { effectiveTier } from '../utils/effective-tier';

/**
 * Guard that checks if the user meets the minimum verification tier requirement.
 *
 * Must be used after JwtAuthGuard to ensure user is authenticated.
 *
 * Usage:
 * ```typescript
 * @UseGuards(JwtAuthGuard, TierGuard)
 * @MinTier(VerificationTier.TIER_1)
 * @Post('listings')
 * createListing() { ... }
 * ```
 */
@Injectable()
export class TierGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    // Skip tier check for routes marked @Public() (e.g. admin endpoints on user controllers)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredTier = this.reflector.getAllAndOverride<VerificationTier>(
      MIN_TIER_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no tier requirement is set, allow access
    if (!requiredTier) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Effective tier: students = their real tier; vendor-only accounts map
    // from vendor verification (active → TIER_2-equivalent) — rev-2 01.5.
    const userTier = effectiveTier(user);

    if (!tierMeetsRequirement(userTier, requiredTier)) {
      const tierMessages: Record<VerificationTier, string> = {
        [VerificationTier.NONE]:
          'You must register to access this feature.',
        [VerificationTier.TIER_0]:
          'You must verify your phone and email to access this feature.',
        [VerificationTier.TIER_1]:
          'You must complete student verification (upload documents) to access this feature.',
        [VerificationTier.TIER_2]:
          'You must complete identity verification (BVN/NIN) to access this feature.',
      };

      throw new ForbiddenException({
        message: tierMessages[requiredTier],
        requiredTier,
        currentTier: userTier,
        upgradeRequired: true,
      });
    }

    return true;
  }
}

/**
 * Tier-based amount limit metadata key
 */
export const TIER_AMOUNT_LIMIT_KEY = 'tierAmountLimit';

/**
 * Interface for tier-based amount limits
 */
export interface TierAmountLimitConfig {
  /** One body field, or several — every field that is present is capped. */
  field: string | string[];
  limits: Partial<Record<VerificationTier, number | null>>;
}

/**
 * Decorator to specify tier-based amount limits for an endpoint.
 *
 * Usage:
 * ```typescript
 * @TierAmountLimit('price', {
 *   [VerificationTier.TIER_0]: 30000,
 *   [VerificationTier.TIER_1]: 60000,
 *   [VerificationTier.TIER_2]: null, // unlimited
 * })
 * @Post('escrow')
 * createEscrow() { ... }
 * ```
 *
 * Pass an array to cap several fields at once — e.g. a budget range
 * `['budgetMax', 'budgetMin']`, so omitting the optional max can't dodge the
 * cap by carrying the whole amount in the min.
 */
import { SetMetadata } from '@nestjs/common';

export const TierAmountLimit = (
  field: string | string[],
  limits: Partial<Record<VerificationTier, number | null>>,
) => SetMetadata(TIER_AMOUNT_LIMIT_KEY, { field, limits });

/**
 * Guard that checks tier-based amount limits.
 *
 * Must be used after JwtAuthGuard to ensure user is authenticated.
 */
@Injectable()
export class TierAmountLimitGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    // Skip for routes marked @Public() (e.g. admin endpoints on user controllers)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const config = this.reflector.getAllAndOverride<TierAmountLimitConfig>(
      TIER_AMOUNT_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no amount limit is set, allow access
    if (!config) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const body = request.body;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const userTier: VerificationTier = effectiveTier(user);
    const limit = config.limits[userTier as VerificationTier];

    // null means unlimited
    if (limit === null || limit === undefined) {
      return true;
    }

    const fields = Array.isArray(config.field) ? config.field : [config.field];

    for (const field of fields) {
      const amount = this.getNestedValue(body, field);

      if (typeof amount !== 'number') {
        // Not provided or not a number — DTO validation owns that case
        continue;
      }

      if (amount > limit) {
        throw new ForbiddenException({
          message: `Amount exceeds your tier limit. Maximum allowed: ₦${limit.toLocaleString()}`,
          field,
          limit,
          amount,
          currentTier: userTier,
          upgradeRequired: true,
        });
      }
    }

    return true;
  }

  /**
   * Get nested value from object using dot notation
   * e.g., 'escrow.amount' -> obj.escrow.amount
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((acc, key) => acc?.[key], obj);
  }
}

/**
 * Helper function to get amount limit for a user's tier.
 * The tables live in src/common/constants/tier-limits.ts — the single source
 * shared with the @TierAmountLimit decorator configs and service-level checks.
 */
export function getAmountLimitForTier(
  tier: VerificationTier,
  type: TierLimitType,
): number | null {
  const limit = TIER_LIMIT_TABLES[type]?.[tier];
  return limit === undefined ? 0 : limit;
}
