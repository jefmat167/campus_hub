import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TransactionPinService } from './transaction-pin.service';

export const REQUIRE_TRANSACTION_PIN_KEY = 'requireTransactionPin';

/**
 * Marks an endpoint as requiring the caller's transaction PIN, read from the
 * request body's `pin` field. Pair with `TransactionPinGuard` in the route's
 * guard chain, after `JwtAuthGuard`.
 *
 * Usage:
 * ```typescript
 * @UseGuards(JwtAuthGuard, TierGuard, TransactionPinGuard)
 * @RequireTransactionPin()
 * @Post('escrow')
 * createEscrow() { ... }
 * ```
 */
export const RequireTransactionPin = () =>
  SetMetadata(REQUIRE_TRANSACTION_PIN_KEY, true);

/**
 * Verifies the caller's transaction PIN (with lockout) before a money-out
 * handler runs. No-op unless the route carries `@RequireTransactionPin()`, so
 * it's safe to place in a class-level guard chain (mirrors TierGuard).
 */
@Injectable()
export class TransactionPinGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pinService: TransactionPinService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<boolean>(
      REQUIRE_TRANSACTION_PIN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('User not authenticated');

    // Throws on any failure (no PIN set / locked / missing / wrong).
    await this.pinService.verifyForTransaction(user.id, request.body?.pin);
    return true;
  }
}
