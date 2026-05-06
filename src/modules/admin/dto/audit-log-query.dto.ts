import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsString,
  IsDateString,
  IsNumberString,
} from 'class-validator';
import {
  AuditAction,
  AuditTargetType,
} from '../../../database/entities/admin-audit-log.entity';

export class AuditLogQueryDto {
  @ApiPropertyOptional({ description: 'Filter by admin who performed the action' })
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiPropertyOptional({ enum: AuditAction, description: 'Filter by action type' })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ enum: AuditTargetType, description: 'Filter by target type' })
  @IsOptional()
  @IsEnum(AuditTargetType)
  targetType?: AuditTargetType;

  @ApiPropertyOptional({ description: 'Filter by target ID' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Page number', default: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ description: 'Items per page', default: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
