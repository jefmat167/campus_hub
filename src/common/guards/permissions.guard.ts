import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { UserRole } from '../../database/entities/user.entity';
import { AdminPermission } from '../../database/entities/admin-permission.entity';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { MODERATOR_PERMISSIONS } from '../constants/permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<string>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission decorator = no restriction
    if (!requiredPermission) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) throw new ForbiddenException('Not authenticated');

    // SUPER_ADMIN: implicit all permissions
    if (user.role === UserRole.SUPER_ADMIN) return true;

    // MODERATOR: check against hardcoded moderator permissions
    if (user.role === UserRole.MODERATOR) {
      if ((MODERATOR_PERMISSIONS as string[]).includes(requiredPermission)) {
        return true;
      }
      throw new ForbiddenException('Insufficient permissions');
    }

    // ADMIN: check granted permissions (cached)
    if (user.role === UserRole.ADMIN) {
      const permissions = await this.getUserPermissions(user.id);
      if (permissions.includes(requiredPermission)) return true;
      throw new ForbiddenException('Insufficient permissions');
    }

    // USER role: deny
    throw new ForbiddenException('Admin access required');
  }

  private async getUserPermissions(userId: string): Promise<string[]> {
    const cacheKey = `admin_permissions:${userId}`;
    const cached = await this.cacheManager.get<string[]>(cacheKey);
    if (cached) return cached;

    const repo = this.dataSource.getRepository(AdminPermission);
    const records = await repo.find({
      where: { userId },
      select: ['permission'],
    });
    const permissions = records.map((r) => r.permission);

    await this.cacheManager.set(cacheKey, permissions, 300_000); // 5 min TTL
    return permissions;
  }
}
