import { IsString, IsNotEmpty, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LoginPlatform {
  MOBILE = 'mobile',
  WEB = 'web',
}

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'student@university.edu.ng',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePass123',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description: 'Platform from which the request is coming',
    enum: LoginPlatform,
    default: LoginPlatform.MOBILE,
    example: LoginPlatform.MOBILE,
  })
  @IsOptional()
  @IsEnum(LoginPlatform)
  platform?: LoginPlatform;

  @ApiPropertyOptional({
    description: 'Unique device identifier for push notifications',
    example: 'device-uuid-12345',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
