import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Request } from 'express';
import { Admin } from '../../../database/entities/admin.entity';

export interface AdminJwtPayload {
  sub: string;
  email: string;
  type: 'admin';
  jti?: string;
  iat?: number;
  exp?: number;
}

function extractJwtFromCookieOrHeader(req: Request): string | null {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (fromHeader) return fromHeader;

  if (req.cookies?.admin_access_token) {
    return req.cookies.admin_access_token;
  }

  return null;
}

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(Admin)
    private adminRepo: Repository<Admin>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    super({
      jwtFromRequest: extractJwtFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AdminJwtPayload): Promise<Admin> {
    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (payload.jti) {
      const isBlacklisted = await this.cacheManager.get(`blacklist:${payload.jti}`);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    const admin = await this.adminRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'fullName', 'role', 'isActive'],
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is disabled');
    }

    return admin;
  }
}
