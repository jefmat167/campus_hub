import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Admin rejection — the reason is shown to the vendor. */
export class RejectVendorDto {
  @ApiProperty({
    description: 'Why the application was rejected (shown to the vendor)',
    example: 'Shopfront photo does not show a real business location',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}

/** Admin suspension — the reason is shown to the vendor. */
export class SuspendVendorDto {
  @ApiProperty({
    description: 'Why the vendor was suspended (shown to the vendor)',
    maxLength: 1000,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
