import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Request } from 'express';
import { AccountType, User } from '../../../database/entities/user.entity';
import { VendorProfile } from '../../../database/entities/vendor-profile.entity';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  universityId: string | null; // null for vendor-only accounts (rev-2 01.5)
  accountType?: string; // 'student' | 'vendor' (absent on pre-rev-2 tokens)
  jti?: string; // JWT ID for blacklisting
  iat?: number;
  exp?: number;
}

function extractJwtFromCookieOrHeader(req: Request): string | null {
  // First try Bearer token from Authorization header
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) {
    return fromHeader;
  }

  // Fall back to access_token cookie (web platform)
  if (req.cookies?.access_token) {
    return req.cookies.access_token;
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(VendorProfile)
    private vendorProfileRepo: Repository<VendorProfile>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload & { type?: string }): Promise<User> {
    // Reject admin tokens
    if (payload.type === 'admin') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Check if token is blacklisted
    if (payload.jti) {
      const isBlacklisted = await this.cacheManager.get(`blacklist:${payload.jti}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const user = await this.userRepo.findOne({
      where: { id: payload.sub },
      select: [
        'id',
        'email',
        'fullName',
        'gender',
        'phone',
        'universityId',
        'facultyId',
        'departmentId',
        'verificationTier',
        'isBanned',
        'banExpiresAt',
        'isDeleted',
        'isDeactivated',
        'profilePhotoUrl',
        'yearOfStudy',
        'role',
        'accountType'
      ],
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user account is deleted
    if (user.isDeleted) {
      throw new UnauthorizedException('This account has been deleted');
    }

    // Check if user account is deactivated (pending deletion)
    if (user.isDeactivated) {
      throw new UnauthorizedException('This account is scheduled for deletion. Please log in to cancel.');
    }

    // Check if user is banned
    if (user.isBanned && (!user.banExpiresAt || user.banExpiresAt > new Date())) {
      throw new UnauthorizedException('Your account has been suspended');
    }

    // Vendor-only accounts hold no student tier — attach the vendor-profile
    // status so guards can compute the effective tier without extra queries
    // (common/utils/effective-tier.ts). Student requests skip the lookup.
    if (user.accountType === AccountType.VENDOR) {
      const profile = await this.vendorProfileRepo.findOne({
        where: { userId: user.id },
        select: ['id', 'status'],
      });
      user.vendorStatus = profile?.status ?? null;
    }

    return user;
  }
}
