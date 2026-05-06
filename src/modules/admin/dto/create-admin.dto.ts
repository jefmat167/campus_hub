import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsUUID,
  IsArray,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  ArrayMinSize,
  IsIn,
} from 'class-validator';
import { ALL_PERMISSIONS } from '../../../common/constants/permissions';

export class CreateAdminDto {
  @ApiProperty({ example: 'admin@campus.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '08012345678' })
  @IsString()
  @Matches(/^0[789][01]\d{8}$/, { message: 'Invalid Nigerian phone number' })
  phone: string;

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

  @ApiProperty()
  @IsUUID()
  universityId: string;

  @ApiProperty()
  @IsUUID()
  facultyId: string;

  @ApiProperty()
  @IsUUID()
  departmentId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  yearOfStudy?: string;

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
