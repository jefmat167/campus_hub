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

    const userTier = user.verificationTier || VerificationTier.NONE;

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
  field: string;
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
 */
import { SetMetadata } from '@nestjs/common';

export const TierAmountLimit = (
  field: string,
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

    const userTier: VerificationTier = user.verificationTier || VerificationTier.NONE;
    const limit = config.limits[userTier as VerificationTier];

    // null means unlimited
    if (limit === null || limit === undefined) {
      return true;
    }

    const amount = this.getNestedValue(body, config.field);

    if (typeof amount !== 'number') {
      // If amount is not provided or not a number, let validation handle it
      return true;
    }

    if (amount > limit) {
      throw new ForbiddenException({
        message: `Amount exceeds your tier limit. Maximum allowed: ₦${limit.toLocaleString()}`,
        field: config.field,
        limit,
        amount,
        currentTier: userTier,
        upgradeRequired: true,
      });
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
 * Helper function to get amount limit for a user's tier
 */
export function getAmountLimitForTier(
  tier: VerificationTier,
  type: 'buying' | 'selling' | 'housing',
): number | null {
  const limits: Record<string, Record<VerificationTier, number | null>> = {
    buying: {
      [VerificationTier.NONE]: 0,
      [VerificationTier.TIER_0]: 30000,
      [VerificationTier.TIER_1]: 60000,
      [VerificationTier.TIER_2]: null,
    },
    selling: {
      [VerificationTier.NONE]: 0,
      [VerificationTier.TIER_0]: 0,
      [VerificationTier.TIER_1]: 50000,
      [VerificationTier.TIER_2]: null,
    },
    housing: {
      [VerificationTier.NONE]: 0,
      [VerificationTier.TIER_0]: 0,
      [VerificationTier.TIER_1]: 50000,
      [VerificationTier.TIER_2]: null,
    },
  };

  return limits[type]?.[tier] ?? 0;
}
