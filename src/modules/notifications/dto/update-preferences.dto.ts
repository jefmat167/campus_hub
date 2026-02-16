import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    description: 'Enable/disable all push notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable all email notifications',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable notifications for new messages',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  messagesEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable notifications for offers (received, accepted, etc.)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  offersEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable notifications for escrow updates',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  escrowEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable notifications for reviews received',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  reviewsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable notifications for social interactions (reactions, comments)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  socialEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable notifications for housing/roommate features',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  housingEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable system announcements',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  announcementsEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Enable/disable quiet hours (no notifications during specified time)',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Quiet hours start time (HH:MM format, 24-hour)',
    example: '22:00',
    pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'quietHoursStart must be in HH:MM format',
  })
  quietHoursStart?: string;

  @ApiPropertyOptional({
    description: 'Quiet hours end time (HH:MM format, 24-hour)',
    example: '07:00',
    pattern: '^([01]\\d|2[0-3]):([0-5]\\d)$',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'quietHoursEnd must be in HH:MM format',
  })
  quietHoursEnd?: string;
}
