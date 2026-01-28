import {
  IsString,
  IsNotEmpty,
  IsEmail,
  MinLength,
  MaxLength,
  Matches,
  IsUUID,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { YearOfStudy } from '../../../database/entities/user.entity';

/**
 * Registration DTO - New flow without OTP-gated registration token
 *
 * Flow:
 * 1. User submits registration data (this DTO)
 * 2. Account created with verificationTier = NONE
 * 3. OTP sent to phone, verification email sent to email
 * 4. User verifies phone via POST /auth/verify-phone
 * 5. User verifies email by clicking link
 * 6. When both verified → verificationTier = TIER_0
 */
export class RegisterDto {
  @ApiProperty({
    description: 'Full name of the user',
    example: 'John Doe',
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  fullName: string;

  @ApiProperty({
    description: 'Personal email address',
    example: 'john.doe@gmail.com',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'Nigerian phone number',
    example: '+2348012345678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?234|0)?[789][01]\d{8}$/, {
    message: 'Please provide a valid Nigerian phone number',
  })
  phone: string;

  @ApiProperty({
    description: 'Password (min 8 chars, must include uppercase, lowercase, and number)',
    example: 'SecurePass123',
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({
    description: 'UUID of the university',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  universityId: string;

  @ApiProperty({
    description: 'UUID of the faculty',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  facultyId: string;

  @ApiProperty({
    description: 'UUID of the department',
    example: '550e8400-e29b-41d4-a716-446655440002',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  departmentId: string;

  @ApiProperty({
    description: 'Year of study',
    enum: YearOfStudy,
    example: YearOfStudy.YEAR_3,
  })
  @IsEnum(YearOfStudy)
  @IsNotEmpty()
  yearOfStudy: YearOfStudy;

  @ApiPropertyOptional({
    description: 'Short bio about the user',
    example: 'Computer Science student interested in tech and startups',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  bio?: string;

  @ApiPropertyOptional({
    description: 'Unique device identifier for ban enforcement',
    example: 'device-uuid-12345',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
