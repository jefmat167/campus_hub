import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccountType } from '../../database/entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Restricts a route to STUDENT accounts (marketplace rev-2 spec 01.5):
 * vendor-only accounts have no student identity and never see the student
 * surfaces (P2P marketplace, buy requests, offers, social, roommates, chat,
 * escrow buying, reviews).
 *
 * Must run AFTER JwtAuthGuard (route-level chains included — never place it
 * class-level above a route-level JwtAuthGuard, or request.user won't exist
 * yet). Honours @Public() so inline admin routes keep working.
 */
@Injectable()
export class StudentAccountGuard implements CanActivate {
  constructor(private reflector: Reflector) { }

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.accountType !== AccountType.STUDENT) {
      throw new ForbiddenException({
        message: 'This feature is only available to student accounts.',
        code: 'STUDENT_ACCOUNT_REQUIRED',
      });
    }

    return true;
  }
}
