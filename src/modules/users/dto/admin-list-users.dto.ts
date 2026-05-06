import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsString,
  IsDateString,
  IsNumberString,
  IsIn,
} from 'class-validator';
import { UserRole, VerificationTier } from '../../../database/entities/user.entity';

export class AdminListUsersDto {
  @ApiPropertyOptional({ description: 'Search by name, email, or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Filter by role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: VerificationTier, description: 'Filter by verification tier' })
  @IsOptional()
  @IsEnum(VerificationTier)
  tier?: VerificationTier;

  @ApiPropertyOptional({ description: 'Filter by ban status (true/false)' })
  @IsOptional()
  @IsIn(['true', 'false'])
  isBanned?: string;

  @ApiPropertyOptional({ description: 'Filter by university ID' })
  @IsOptional()
  @IsUUID()
  universityId?: string;

  @ApiPropertyOptional({ description: 'Filter from date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Filter to date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Sort by field', enum: ['createdAt', 'lastActiveAt', 'fullName'] })
  @IsOptional()
  @IsIn(['createdAt', 'lastActiveAt', 'fullName'])
  sortBy?: string;

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @ApiPropertyOptional({ default: '1' })
  @IsOptional()
  @IsNumberString()
  page?: string;

  @ApiPropertyOptional({ default: '20' })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
