import {
  IsString,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { DevicePlatform } from '../../../database/entities/fcm-token.entity';

export class RegisterTokenDto {
  @IsString()
  @MaxLength(500)
  token: string;

  @IsEnum(DevicePlatform)
  platform: DevicePlatform;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceName?: string;
}
