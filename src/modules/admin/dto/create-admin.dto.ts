import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsArray,
  MinLength,
  MaxLength,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { ALL_PERMISSIONS } from '../../../common/constants/permissions';

export class CreateAdminDto {
  @ApiProperty({ example: 'admin@campushub.ng' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePassword123!' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiProperty({ example: 'Admin User' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

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
