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
import { AdminRole } from '../../database/entities/admin.entity';
import { AdminPermission } from '../../database/entities/admin-permission.entity';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

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
    if (user.role === AdminRole.SUPER_ADMIN) return true;

    // ADMIN: check granted permissions (cached)
    if (user.role === AdminRole.ADMIN) {
      const permissions = await this.getAdminPermissions(user.id);
      if (permissions.includes(requiredPermission)) return true;
      throw new ForbiddenException('Insufficient permissions');
    }

    // Not an admin
    throw new ForbiddenException('Admin access required');
  }

  private async getAdminPermissions(adminId: string): Promise<string[]> {
    const cacheKey = `admin_permissions:${adminId}`;
    const cached = await this.cacheManager.get<string[]>(cacheKey);
    if (cached) return cached;

    const repo = this.dataSource.getRepository(AdminPermission);
    const records = await repo.find({
      where: { adminId },
      select: ['permission'],
    });
    const permissions = records.map((r) => r.permission);

    await this.cacheManager.set(cacheKey, permissions, 300_000); // 5 min TTL
    return permissions;
  }
}
