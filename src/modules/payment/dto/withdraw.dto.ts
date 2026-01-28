import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddBankAccountDto {
  @ApiProperty({
    description: 'Nigerian bank account number (10 digits)',
    example: '0123456789',
    minLength: 10,
    maxLength: 10,
  })
  @IsString()
  @Length(10, 10)
  accountNumber: string;

  @ApiProperty({
    description: 'Bank code from Paystack',
    example: '058',
  })
  @IsString()
  bankCode: string;
}

export class InitiateWithdrawalDto {
  @ApiProperty({
    description: 'Amount to withdraw in Naira',
    example: 10000,
    minimum: 500,
    maximum: 5000000,
  })
  @IsNumber()
  @Min(500) // Minimum ₦500 withdrawal
  @Max(5000000) // Maximum ₦5,000,000
  amount: number;

  @ApiPropertyOptional({
    description: 'OTP for verification (required for withdrawals >= ₦50,000)',
    example: '123456',
  })
  @IsString()
  @IsOptional()
  otp?: string; // Required for amounts >= ₦50,000
}

export class VerifyOtpDto {
  @ApiProperty({
    description: 'One-time password',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @Length(6, 6)
  otp: string;

  @ApiProperty({
    description: 'Purpose of OTP verification',
    example: 'withdrawal',
  })
  @IsString()
  purpose: string;
}
