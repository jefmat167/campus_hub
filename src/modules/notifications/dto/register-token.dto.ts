import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DevicePlatform } from '../../../database/entities/fcm-token.entity';

export class RegisterTokenDto {
  @ApiProperty({
    description: 'Firebase Cloud Messaging (FCM) token',
    example: 'dGVzdC1mY20tdG9rZW4tMTIzNDU2Nzg5MGFiY2RlZg...',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  token: string;

  @ApiProperty({
    description: 'Device platform',
    enum: DevicePlatform,
    example: DevicePlatform.ANDROID,
  })
  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @ApiPropertyOptional({
    description: 'Unique device identifier',
    example: 'device-uuid-123-456-789',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @ApiPropertyOptional({
    description: 'Human-readable device name',
    example: 'Samsung Galaxy S21',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}
