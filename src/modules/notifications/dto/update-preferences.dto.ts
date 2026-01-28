import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  pushEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  messagesEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  offersEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  escrowEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  reviewsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  socialEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  housingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  announcementsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  quietHoursEnabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'quietHoursStart must be in HH:MM format',
  })
  quietHoursStart?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'quietHoursEnd must be in HH:MM format',
  })
  quietHoursEnd?: string;
}
