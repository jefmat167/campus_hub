import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectOrderDto {
  @ApiPropertyOptional({
    description: 'Why the order was rejected (shown to the buyer)',
    example: 'Sold out in-store before I could confirm',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
