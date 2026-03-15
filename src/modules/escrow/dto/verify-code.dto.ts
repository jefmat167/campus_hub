import { IsString, Length, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCodeDto {
  @ApiProperty({
    description: '4-digit delivery code',
    example: '1234',
    minLength: 4,
    maxLength: 4,
  })
  @IsString()
  @Length(4, 4, { message: 'code must be exactly 4 digits' })
  @Matches(/^\d{4}$/, { message: 'code must be 4 numeric digits' })
  code: string;
}
