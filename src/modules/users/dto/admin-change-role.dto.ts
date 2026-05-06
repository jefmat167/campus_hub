import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength } from 'class-validator';
import { UserRole } from '../../../database/entities/user.entity';

export class AdminChangeRoleDto {
  @ApiProperty({ enum: UserRole, description: 'New role to assign' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ description: 'Reason for role change', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;
}
