import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InitializeFundingDto {
  @ApiProperty({
    description: 'Amount to fund wallet in Naira',
    example: 5000,
    minimum: 100,
    maximum: 10000000,
  })
  @IsNumber()
  @Min(100) // Minimum ₦100
  @Max(10000000) // Maximum ₦10,000,000
  amount: number;

  @ApiPropertyOptional({
    description: 'URL to redirect to after payment',
    example: 'https://yourapp.com/payment/callback',
  })
  @IsString()
  @IsOptional()
  callbackUrl?: string;
}

export class VerifyPaymentDto {
  @ApiProperty({
    description: 'Paystack payment reference',
    example: 'FUND_abc123xyz',
  })
  @IsString()
  reference: string;
}
