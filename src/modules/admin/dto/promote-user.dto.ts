import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsIn } from 'class-validator';
import { ALL_PERMISSIONS } from '../../../common/constants/permissions';

export class PromoteUserDto {
  @ApiProperty({
    type: [String],
    example: ['users:read', 'dashboard:read'],
    description: 'Array of permission strings to grant',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ALL_PERMISSIONS, { each: true })
  permissions: string[];
}
