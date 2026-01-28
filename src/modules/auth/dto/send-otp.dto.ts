import { IsString, IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({
    description: 'Nigerian phone number',
    example: '+2348012345678',
    pattern: '^(\\+?234|0)?[789][01]\\d{8}$',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?234|0)?[789][01]\d{8}$/, {
    message: 'Please provide a valid Nigerian phone number',
  })
  phone: string;
}
