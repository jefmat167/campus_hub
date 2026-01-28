import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User } from '../../database/entities/user.entity';

export const SKIP_UNIVERSITY_SCOPE_KEY = 'skipUniversityScope';

/**
 * Guard that ensures users only access data within their university
 * Use @SkipUniversityScope() decorator to bypass this guard
 */
@Injectable()
export class UniversityScopeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route should skip university scope check
    const skipScope = this.reflector.getAllAndOverride<boolean>(
      SKIP_UNIVERSITY_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipScope) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user: User = request.user;

    if (!user) {
      return true; // Let other guards handle unauthenticated requests
    }

    // Check for universityId in params, query, or body
    const resourceUniversityId =
      request.params?.universityId ||
      request.query?.universityId ||
      request.body?.universityId;

    if (resourceUniversityId && resourceUniversityId !== user.universityId) {
      throw new ForbiddenException(
        'You can only access resources within your university',
      );
    }

    // Attach university scope to request for use in services
    request.universityScope = user.universityId;

    return true;
  }
}
