import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDropPointDto {
  @ApiProperty({
    description: 'Public name of the handover point',
    example: 'Main Gate',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    description: 'Optional directions/landmark details',
    example: 'Security post beside the pedestrian gate, opposite the car park',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  directions?: string;
}
