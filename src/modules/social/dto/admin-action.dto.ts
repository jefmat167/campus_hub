import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminActionDto {
  @ApiProperty({ description: 'Reason for action', example: 'Violates community guidelines' })
  @IsString()
  @MinLength(5)
  reason: string;
}
