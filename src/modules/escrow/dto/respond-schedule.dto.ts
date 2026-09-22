import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Respond to the open time proposal on a service booking (rev-2 spec 03.6):
 * accept it, reject it (kills the booking, free full refund), or counter
 * with a new time (supersedes; 48h on the table; must sit within 14 days of
 * the order). Only the party who did NOT make the current proposal responds.
 */
export class RespondScheduleDto {
  @ApiProperty({ enum: ['accept', 'reject', 'counter'], example: 'accept' })
  @IsIn(['accept', 'reject', 'counter'])
  action: 'accept' | 'reject' | 'counter';

  @ApiPropertyOptional({
    description: 'New proposed time (counter only), ISO 8601',
    example: '2026-09-02T14:30:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  proposedTime?: string;

  @ApiPropertyOptional({
    description: 'Optional note to the other party',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
