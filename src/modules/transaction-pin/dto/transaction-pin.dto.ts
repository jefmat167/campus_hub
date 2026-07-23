import { IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const PIN_REGEX = /^\d{6}$/;
const PIN_MESSAGE = 'PIN must be exactly 6 digits';

export class SetTransactionPinDto {
  @ApiProperty({ description: 'Account password (confirmation)', example: 'MyP@ssw0rd' })
  @IsString()
  password: string;

  @ApiProperty({ description: '6-digit transaction PIN', example: '135790' })
  @IsString()
  @Matches(PIN_REGEX, { message: PIN_MESSAGE })
  pin: string;
}

export class ChangeTransactionPinDto {
  @ApiProperty({ description: 'Current 6-digit transaction PIN', example: '135790' })
  @IsString()
  @Matches(PIN_REGEX, { message: PIN_MESSAGE })
  currentPin: string;

  @ApiProperty({ description: 'New 6-digit transaction PIN', example: '246810' })
  @IsString()
  @Matches(PIN_REGEX, { message: PIN_MESSAGE })
  newPin: string;
}

export class ResetTransactionPinDto {
  @ApiProperty({ description: 'OTP sent to your phone (pin_reset)', example: '123456' })
  @IsString()
  otp: string;

  @ApiProperty({ description: 'New 6-digit transaction PIN', example: '246810' })
  @IsString()
  @Matches(PIN_REGEX, { message: PIN_MESSAGE })
  newPin: string;
}
