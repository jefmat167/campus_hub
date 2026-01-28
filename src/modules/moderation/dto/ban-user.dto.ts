import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class BanUserDto {
  @IsString()
  @MaxLength(1000)
  reason: string;

  // If not permanent, specify duration in days
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  durationDays?: number;

  // If true, this is a permanent ban
  @IsOptional()
  @IsBoolean()
  permanent?: boolean;

  // Also ban the device ID
  @IsOptional()
  @IsBoolean()
  banDevice?: boolean;

  // Also ban the phone number (prevents re-registration)
  @IsOptional()
  @IsBoolean()
  banPhone?: boolean;
}
