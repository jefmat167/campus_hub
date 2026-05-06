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
import { Repository, DataSource, In } from 'typeorm';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import * as bcrypt from 'bcrypt';
import { User, UserRole, VerificationTier, YearOfStudy } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { AdminPermission as AdminPermissionEntity } from '../../database/entities/admin-permission.entity';
import { AdminAuditService } from './admin-audit.service';
import { AuditAction, AuditTargetType } from '../../database/entities/admin-audit-log.entity';
import { CreateAdminDto } from './dto/create-admin.dto';
import {
  ALL_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  AdminPermissionType,
} from '../../common/constants/permissions';
import { Tier1ReviewStatus } from '../../database/entities/user.entity';

@Injectable()
export class AdminManagementService {
  private readonly logger = new Logger(AdminManagementService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
    @InjectRepository(AdminPermissionEntity)
    private readonly permRepo: Repository<AdminPermissionEntity>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly dataSource: DataSource,
    private readonly auditService: AdminAuditService,
  ) {}

  /**
   * List all admins with their permissions and last login
   */
  async listAdmins(): Promise<any[]> {
    const admins = await this.userRepo.find({
      where: [
        { role: UserRole.ADMIN, isDeleted: false },
        { role: UserRole.SUPER_ADMIN, isDeleted: false },
      ],
      select: [
        'id', 'fullName', 'email', 'phone', 'role',
        'lastLoginAt', 'lastActiveAt', 'createdAt',
        'verificationTier', 'profilePhotoUrl',
      ],
      order: { role: 'DESC', createdAt: 'ASC' },
    });

    // Load permissions for all admins
    const adminIds = admins.map((a) => a.id);
    const permissions = adminIds.length
      ? await this.permRepo.find({
          where: { userId: In(adminIds) },
          select: ['userId', 'permission', 'createdAt'],
        })
      : [];

    const permMap = new Map<string, string[]>();
    for (const p of permissions) {
      const list = permMap.get(p.userId) || [];
      list.push(p.permission);
      permMap.set(p.userId, list);
    }

    return admins.map((admin) => ({
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
      phone: admin.phone,
      role: admin.role,
      permissions: admin.role === UserRole.SUPER_ADMIN
        ? ALL_PERMISSIONS
        : (permMap.get(admin.id) || []),
      lastLoginAt: admin.lastLoginAt,
      lastActiveAt: admin.lastActiveAt,
      createdAt: admin.createdAt,
      profilePhotoUrl: admin.profilePhotoUrl,
    }));
  }

  /**
   * Get permissions for the current admin
   */
  async getMyPermissions(userId: string, role: UserRole): Promise<{ role: UserRole; permissions: string[] }> {
    if (role === UserRole.SUPER_ADMIN) {
      return { role, permissions: [...ALL_PERMISSIONS] };
    }

    const records = await this.permRepo.find({
      where: { userId },
      select: ['permission'],
    });

    return { role, permissions: records.map((r) => r.permission) };
  }

  /**
   * Create a new admin user
   */
  async createAdmin(dto: CreateAdminDto, granterId: string): Promise<any> {
    // Check for duplicate email/phone
    const existing = await this.userRepo.findOne({
      where: [{ email: dto.email }, { phone: dto.phone }],
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email
          ? 'Email already in use'
          : 'Phone number already in use',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let user: User;

    try {
      const passwordHash = await bcrypt.hash(dto.password, 12);

      user = this.userRepo.create({
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        fullName: dto.fullName,
        universityId: dto.universityId,
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        yearOfStudy: dto.yearOfStudy as YearOfStudy,
        role: UserRole.ADMIN,
        verificationTier: VerificationTier.TIER_2,
        phoneVerified: true,
        emailVerified: true,
        tier1ReviewStatus: Tier1ReviewStatus.APPROVED,
        bvnVerified: true,
        ninVerified: true,
      });

      await queryRunner.manager.save(user);

      // Create wallet
      const wallet = this.walletRepo.create({ userId: user.id });
      await queryRunner.manager.save(wallet);

      // Create permissions
      const permEntities = dto.permissions.map((perm) =>
        this.permRepo.create({
          userId: user.id,
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
      AuditTargetType.USER,
      user.id,
      undefined,
      { email: dto.email, permissions: dto.permissions },
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      permissions: dto.permissions,
    };
  }

  /**
   * Promote an existing user to admin
   */
  async promoteToAdmin(
    userId: string,
    permissions: string[],
    granterId: string,
  ): Promise<any> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('User is already an admin');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      user.role = UserRole.ADMIN;
      await queryRunner.manager.save(user);

      const permEntities = permissions.map((perm) =>
        this.permRepo.create({
          userId: user.id,
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

    await this.invalidatePermissionCache(userId);

    await this.auditService.log(
      granterId,
      AuditAction.ADMIN_PROMOTE,
      AuditTargetType.USER,
      userId,
      undefined,
      { previousRole: UserRole.USER, permissions },
    );

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: UserRole.ADMIN,
      permissions,
    };
  }

  /**
   * Update admin permissions (replace all)
   */
  async updatePermissions(
    userId: string,
    permissions: string[],
    granterId: string,
  ): Promise<{ permissions: string[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Can only update permissions for ADMIN users');
    }
    if (userId === granterId) {
      throw new ForbiddenException('Cannot update your own permissions');
    }

    // Get current permissions for audit
    const currentPerms = await this.permRepo.find({
      where: { userId },
      select: ['permission'],
    });
    const currentPermNames = currentPerms.map((p) => p.permission);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Delete all existing permissions
      await queryRunner.manager.delete(AdminPermissionEntity, { userId });

      // Insert new permissions
      if (permissions.length > 0) {
        const permEntities = permissions.map((perm) =>
          this.permRepo.create({
            userId,
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

    await this.invalidatePermissionCache(userId);

    // Log grants and revokes
    const granted = permissions.filter((p) => !currentPermNames.includes(p));
    const revoked = currentPermNames.filter((p) => !permissions.includes(p));

    if (granted.length > 0) {
      await this.auditService.log(
        granterId,
        AuditAction.ADMIN_PERMISSION_GRANT,
        AuditTargetType.USER,
        userId,
        undefined,
        { granted },
      );
    }
    if (revoked.length > 0) {
      await this.auditService.log(
        granterId,
        AuditAction.ADMIN_PERMISSION_REVOKE,
        AuditTargetType.USER,
        userId,
        undefined,
        { revoked },
      );
    }

    return { permissions };
  }

  /**
   * Demote admin back to regular user
   */
  async demoteAdmin(userId: string, granterId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role !== UserRole.ADMIN) {
      throw new BadRequestException('Can only demote ADMIN users');
    }
    if (userId === granterId) {
      throw new ForbiddenException('Cannot demote yourself');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      user.role = UserRole.USER;
      user.refreshTokenHash = null as any; // Force logout
      await queryRunner.manager.save(user);

      // Delete all permissions
      await queryRunner.manager.delete(AdminPermissionEntity, { userId });

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.invalidatePermissionCache(userId);

    await this.auditService.log(
      granterId,
      AuditAction.ADMIN_DEMOTE,
      AuditTargetType.USER,
      userId,
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

  private async invalidatePermissionCache(userId: string): Promise<void> {
    await this.cacheManager.del(`admin_permissions:${userId}`);
  }
}
