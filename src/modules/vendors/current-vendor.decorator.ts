import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';

/**
 * The caller's vendor profile, attached to the request by VendorGuard.
 * Only meaningful on routes guarded with `@UseGuards(JwtAuthGuard, VendorGuard)`.
 */
export const CurrentVendor = createParamDecorator(
  (data: keyof VendorProfile | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const profile: VendorProfile | undefined = request.vendorProfile;
    return data ? profile?.[data] : profile;
  },
);
