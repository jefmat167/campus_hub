import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength } from 'class-validator';
import { VerificationTier } from '../../../database/entities/user.entity';

export class AdminAdjustTierDto {
  @ApiProperty({ enum: VerificationTier, description: 'New verification tier' })
  @IsEnum(VerificationTier)
  tier: VerificationTier;

  @ApiProperty({ description: 'Reason for tier adjustment', maxLength: 500 })
  @IsString()
  @MaxLength(500)
  reason: string;
}
