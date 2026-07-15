import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import * as bcrypt from 'bcrypt';
import { Admin, AdminRole } from '../../database/entities/admin.entity';
import { AdminPermission as AdminPermissionEntity } from '../../database/entities/admin-permission.entity';
import { AdminAuditService } from './admin-audit.service';
import { AuditAction, AuditTargetType } from '../../database/entities/admin-audit-log.entity';
import { CreateAdminDto } from './dto/create-admin.dto';
import {
  ALL_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  AdminPermissionType,
} from '../../common/constants/permissions';

@Injectable()
export class AdminManagementService {
  private readonly logger = new Logger(AdminManagementService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(AdminPermissionEntity)
    private readonly permRepo: Repository<AdminPermissionEntity>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly dataSource: DataSource,
    private readonly auditService: AdminAuditService,
  ) {}

  /**
   * List all admins with their permissions
   */
  async listAdmins(): Promise<any[]> {
    const admins = await this.adminRepo.find({
      where: { isActive: true },
      select: [
        'id', 'fullName', 'email', 'role',
        'lastLoginAt', 'isActive', 'createdAt',
      ],
      order: { role: 'DESC', createdAt: 'ASC' },
    });

    const adminIds = admins.map((a) => a.id);
    const permissions = adminIds.length
      ? await this.permRepo.find({
          where: { adminId: adminIds.length === 1 ? adminIds[0] : undefined },
          select: ['adminId', 'permission', 'createdAt'],
        })
      : [];

    // For multiple IDs, query properly
    let permMap = new Map<string, string[]>();
    if (adminIds.length > 1) {
      const allPerms = await this.permRepo
        .createQueryBuilder('p')
        .where('p.admin_id IN (:...ids)', { ids: adminIds })
        .select(['p.adminId', 'p.permission'])
        .getMany();
      for (const p of allPerms) {
        const list = permMap.get(p.adminId) || [];
        list.push(p.permission);
        permMap.set(p.adminId, list);
      }
    } else if (adminIds.length === 1) {
      for (const p of permissions) {
        const list = permMap.get(p.adminId) || [];
        list.push(p.permission);
        permMap.set(p.adminId, list);
      }
    }

    return admins.map((admin) => ({
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
      role: admin.role,
      permissions: admin.role === AdminRole.SUPER_ADMIN
        ? ALL_PERMISSIONS
        : (permMap.get(admin.id) || []),
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    }));
  }

  /**
   * Get current admin profile with permissions
   */
  async getMe(adminId: string, role: AdminRole) {
    const admin = await this.adminRepo.findOne({
      where: { id: adminId },
      select: ['id', 'email', 'fullName', 'role', 'lastLoginAt', 'createdAt'],
    });

    if (!admin) throw new NotFoundException('Admin not found');

    const permissions =
      role === AdminRole.SUPER_ADMIN
        ? [...ALL_PERMISSIONS]
        : (await this.permRepo.find({ where: { adminId }, select: ['permission'] })).map((r) => r.permission);

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      permissions,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
    };
  }

  /**
   * Create a new admin
   */
  async createAdmin(dto: CreateAdminDto, granterId: string): Promise<any> {
    const existing = await this.adminRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let admin: Admin;

    try {
      const passwordHash = await bcrypt.hash(dto.password, 12);

      admin = this.adminRepo.create({
        email: dto.email,
        passwordHash,
        fullName: dto.fullName,
        role: AdminRole.ADMIN,
      });

      await queryRunner.manager.save(admin);

      // Create permissions
      const permEntities = dto.permissions.map((perm) =>
        this.permRepo.create({
          adminId: admin.id,
          permission: perm,
          grantedBy: granterId,
        }),
      );
      await queryRunner.manager.save(permEntities);

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.auditService.log(
      granterId,
      AuditAction.ADMIN_CREATE,
      AuditTargetType.ADMIN,
      admin.id,
      undefined,
      { email: dto.email, permissions: dto.permissions },
    );

    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      role: admin.role,
      permissions: dto.permissions,
    };
  }

  /**
   * Update admin permissions (replace all)
   */
  async updatePermissions(
    adminId: string,
    permissions: string[],
    granterId: string,
  ): Promise<{ permissions: string[] }> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('Admin not found');
    if (admin.role !== AdminRole.ADMIN) {
      throw new BadRequestException('Cannot update permissions for SUPER_ADMIN');
    }
    if (adminId === granterId) {
      throw new ForbiddenException('Cannot update your own permissions');
    }

    // Get current permissions for audit
    const currentPerms = await this.permRepo.find({
      where: { adminId },
      select: ['permission'],
    });
    const currentPermNames = currentPerms.map((p) => p.permission);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.manager.delete(AdminPermissionEntity, { adminId });

      if (permissions.length > 0) {
        const permEntities = permissions.map((perm) =>
          this.permRepo.create({
            adminId,
            permission: perm,
            grantedBy: granterId,
          }),
        );
        await queryRunner.manager.save(permEntities);
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.invalidatePermissionCache(adminId);

    const granted = permissions.filter((p) => !currentPermNames.includes(p));
    const revoked = currentPermNames.filter((p) => !permissions.includes(p));

    if (granted.length > 0) {
      await this.auditService.log(
        granterId,
        AuditAction.ADMIN_PERMISSION_GRANT,
        AuditTargetType.ADMIN,
        adminId,
        undefined,
        { granted },
      );
    }
    if (revoked.length > 0) {
      await this.auditService.log(
        granterId,
        AuditAction.ADMIN_PERMISSION_REVOKE,
        AuditTargetType.ADMIN,
        adminId,
        undefined,
        { revoked },
      );
    }

    return { permissions };
  }

  /**
   * Deactivate an admin account
   */
  async deactivateAdmin(adminId: string, granterId: string): Promise<void> {
    const admin = await this.adminRepo.findOne({ where: { id: adminId } });
    if (!admin) throw new NotFoundException('Admin not found');
    if (admin.role !== AdminRole.ADMIN) {
      throw new BadRequestException('Cannot deactivate a SUPER_ADMIN');
    }
    if (adminId === granterId) {
      throw new ForbiddenException('Cannot deactivate yourself');
    }

    admin.isActive = false;
    admin.refreshTokenHash = null; // Force logout
    await this.adminRepo.save(admin);

    await this.invalidatePermissionCache(adminId);

    await this.auditService.log(
      granterId,
      AuditAction.ADMIN_DEACTIVATE,
      AuditTargetType.ADMIN,
      adminId,
    );
  }

  /**
   * List all available permissions with descriptions
   */
  listAvailablePermissions(): { permission: string; description: string }[] {
    return ALL_PERMISSIONS.map((p) => ({
      permission: p,
      description: PERMISSION_DESCRIPTIONS[p as AdminPermissionType] || p,
    }));
  }

  private async invalidatePermissionCache(adminId: string): Promise<void> {
    await this.cacheManager.del(`admin_permissions:${adminId}`);
  }
}
