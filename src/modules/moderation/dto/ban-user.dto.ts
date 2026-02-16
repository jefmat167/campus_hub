import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({
    description: 'Reason for the ban',
    example: 'Repeated scam attempts and harassment of other users.',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({
    description: 'Duration of temporary ban in days (ignored if permanent is true)',
    example: 30,
    minimum: 1,
    maximum: 365,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  durationDays?: number;

  @ApiPropertyOptional({
    description: 'Whether this is a permanent ban',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  permanent?: boolean;

  @ApiPropertyOptional({
    description: 'Also ban the device ID (prevents re-login on same device)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  banDevice?: boolean;

  @ApiPropertyOptional({
    description: 'Also ban the phone number (prevents re-registration)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  banPhone?: boolean;
}
