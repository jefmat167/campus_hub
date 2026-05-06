import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class AdminTakedownDto {
  @ApiProperty({ description: 'Reason for takedown', example: 'Violates marketplace policy' })
  @IsString()
  @MinLength(5)
  reason: string;
}
