import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

/**
 * Requires the caller to have a vendor profile (any status — pending vendors
 * must still see their own application). Attaches it as request.vendorProfile
 * so handlers/services don't re-query. ACTIVE-only enforcement for catalog
 * and order operations arrives with the vendor plane in Phase 4.
 *
 * Must run after JwtAuthGuard. Honours @Public().
 */
@Injectable()
export class VendorGuard implements CanActivate {
  constructor(
    @InjectRepository(VendorProfile)
    private profileRepo: Repository<VendorProfile>,
    private reflector: Reflector,
  ) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const profile = await this.profileRepo.findOne({
      where: { userId: user.id },
    });
    if (!profile) {
      throw new ForbiddenException({
        message: 'No vendor profile on this account. Apply first.',
        code: 'VENDOR_PROFILE_REQUIRED',
      });
    }

    request.vendorProfile = profile;
    return true;
  }
}
