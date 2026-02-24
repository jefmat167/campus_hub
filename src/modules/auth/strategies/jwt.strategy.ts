import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { User } from '../../../database/entities/user.entity';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  universityId: string;
  jti?: string; // JWT ID for blacklisting
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @Inject(CACHE_MANAGER)
    private cacheManager: Cache,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
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
        'role'
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

    return user;
  }
}
