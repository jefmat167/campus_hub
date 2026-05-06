import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn } from 'class-validator';
import { ALL_PERMISSIONS } from '../../../common/constants/permissions';

export class UpdatePermissionsDto {
  @ApiProperty({
    type: [String],
    example: ['users:read', 'users:manage', 'dashboard:read'],
    description: 'Complete list of permissions (replaces existing)',
  })
  @IsArray()
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions: string[];
}
