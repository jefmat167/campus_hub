import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AdminAuditLog,
  AuditAction,
  AuditTargetType,
} from '../../database/entities/admin-audit-log.entity';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminAuditLog)
    private auditLogRepo: Repository<AdminAuditLog>,
  ) {}

  async log(
    adminId: string,
    action: AuditAction,
    targetType: AuditTargetType,
    targetId: string,
    reason?: string,
    metadata?: Record<string, unknown>,
    ipAddress?: string,
  ): Promise<void> {
    try {
      const entry = this.auditLogRepo.create({
        adminId,
        action,
        targetType,
        targetId,
        reason: reason || null,
        metadata: metadata || null,
        ipAddress: ipAddress || null,
      });
      await this.auditLogRepo.save(entry);
    } catch (error) {
      this.logger.error(`Failed to write audit log: ${error}`);
    }
  }

  async getLogs(
    dto: AuditLogQueryDto,
  ): Promise<{ logs: AdminAuditLog[]; total: number }> {
    const page = Number(dto.page) || 1;
    const limit = Math.min(Number(dto.limit) || 20, 100);

    const query = this.auditLogRepo
      .createQueryBuilder('log')
      .leftJoinAndSelect('log.admin', 'admin')
      .orderBy('log.createdAt', 'DESC');

    if (dto.adminId) {
      query.andWhere('log.adminId = :adminId', { adminId: dto.adminId });
    }

    if (dto.action) {
      query.andWhere('log.action = :action', { action: dto.action });
    }

    if (dto.targetType) {
      query.andWhere('log.targetType = :targetType', {
        targetType: dto.targetType,
      });
    }

    if (dto.targetId) {
      query.andWhere('log.targetId = :targetId', { targetId: dto.targetId });
    }

    if (dto.dateFrom) {
      query.andWhere('log.createdAt >= :dateFrom', { dateFrom: dto.dateFrom });
    }

    if (dto.dateTo) {
      query.andWhere('log.createdAt <= :dateTo', { dateTo: dto.dateTo });
    }

    // Sanitize admin in results
    query.addSelect([
      'admin.id',
      'admin.fullName',
      'admin.email',
      'admin.role',
    ]);

    const [logs, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { logs, total };
  }
}
