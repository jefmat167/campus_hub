import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateDropPointDto {
  @ApiPropertyOptional({
    description: 'Public name of the handover point',
    example: 'Main Gate (North)',
    maxLength: 255,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    description: 'Directions/landmark details. null clears them.',
    maxLength: 1000,
    nullable: true,
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  directions?: string | null;

  @ApiPropertyOptional({
    description:
      'Soft-disable flag — inactive points stop being offered for new orders but stay referenced by historical ones',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
