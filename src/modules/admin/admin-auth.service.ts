import {
  Injectable,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Admin } from '../../database/entities/admin.entity';

export interface AdminTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
  ) {}

  async login(
    email: string,
    password: string,
  ): Promise<{ admin: Partial<Admin>; tokens: AdminTokenPair }> {
    const admin = await this.adminRepo.findOne({
      where: { email },
      select: ['id', 'email', 'fullName', 'role', 'passwordHash', 'isActive'],
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is disabled');
    }

    const isPasswordValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(admin);

    admin.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    admin.lastLoginAt = new Date();
    await this.adminRepo.save(admin);

    return {
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName,
        role: admin.role,
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<AdminTokenPair> {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'admin') {
      throw new UnauthorizedException('Invalid token type');
    }

    const admin = await this.adminRepo.findOne({
      where: { id: payload.sub },
      select: ['id', 'email', 'fullName', 'role', 'refreshTokenHash', 'isActive'],
    });

    if (!admin || !admin.isActive || !admin.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const isValid = await bcrypt.compare(refreshToken, admin.refreshTokenHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.generateTokens(admin);
    admin.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.adminRepo.save(admin);

    return tokens;
  }

  async logout(accessToken: string, adminId: string): Promise<void> {
    try {
      const decoded = this.jwtService.decode(accessToken) as any;
      if (decoded?.jti && decoded?.exp) {
        const ttl = decoded.exp * 1000 - Date.now();
        if (ttl > 0) {
          await this.cacheManager.set(`blacklist:${decoded.jti}`, '1', ttl);
        }
      }
    } catch {
      // ignore decode errors
    }

    await this.adminRepo.update(adminId, { refreshTokenHash: null });
  }

  private async generateTokens(admin: Admin): Promise<AdminTokenPair> {
    const basePayload = {
      sub: admin.id,
      email: admin.email,
      type: 'admin' as const,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, jti: uuidv4() },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m') as string,
        } as any,
      ),
      this.jwtService.signAsync(
        { ...basePayload, jti: uuidv4() },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d') as string,
        } as any,
      ),
    ]);

    return { accessToken, refreshToken, expiresIn: 900 };
  }
}
