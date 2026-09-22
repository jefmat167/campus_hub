import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** CAC registration details for the optional Verified badge (spec 03.1). */
export class SubmitCacDto {
  @ApiProperty({
    description: 'CAC registration number (RC/BN)',
    example: 'BN1234567',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Transform(({ value }) => value?.trim())
  cacNumber: string;

  @ApiProperty({
    description: 'CAC certificate document (uploaded via /upload first)',
    maxLength: 500,
  })
  @IsUrl()
  @MaxLength(500)
  cacDocumentUrl: string;
}
