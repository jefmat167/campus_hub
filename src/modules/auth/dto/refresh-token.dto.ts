import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoginPlatform } from './login.dto';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'JWT refresh token (required for mobile, optional for web - uses cookie)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsOptional()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'Platform from which the request is coming',
    enum: LoginPlatform,
    default: LoginPlatform.MOBILE,
    example: LoginPlatform.MOBILE,
  })
  @IsOptional()
  @IsEnum(LoginPlatform)
  platform?: LoginPlatform;
}
