import { IsString, IsNotEmpty, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({
    description: 'Nigerian phone number',
    example: '+2348012345678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?234|0)?[789][01]\d{8}$/, {
    message: 'Please provide a valid Nigerian phone number',
  })
  phone: string;

  @ApiProperty({
    description: '6-digit OTP code sent to phone',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/, {
    message: 'OTP must be a 6-digit number',
  })
  otp: string;
}
