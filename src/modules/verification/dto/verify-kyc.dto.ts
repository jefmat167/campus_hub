import { IsString, IsNotEmpty, Matches, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { KycType } from '../../../database/entities/kyc-verification.entity';

/**
 * DTO for verifying BVN
 */
export class VerifyBvnDto {
  @ApiProperty({
    description: 'Bank Verification Number (11 digits)',
    example: '22222222222',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{11}$/, { message: 'BVN must be exactly 11 digits' })
  bvn: string;
}

/**
 * DTO for verifying NIN
 */
export class VerifyNinDto {
  @ApiProperty({
    description: 'National Identification Number (11 digits)',
    example: '11111111111',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{11}$/, { message: 'NIN must be exactly 11 digits' })
  nin: string;
}

/**
 * DTO for adding a second KYC type (for users who already have Tier 2)
 */
export class AddSecondKycDto {
  @ApiProperty({
    description: 'Type of KYC to add',
    enum: KycType,
    example: KycType.NIN,
  })
  @IsEnum(KycType)
  type: KycType;

  @ApiProperty({
    description: 'The BVN or NIN value (11 digits)',
    example: '11111111111',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{11}$/, { message: 'Value must be exactly 11 digits' })
  value: string;
}
