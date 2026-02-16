import {
  IsEnum,
  IsString,
  IsArray,
  IsOptional,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeReason } from '../../../database/entities/dispute.entity';

export class OpenDisputeDto {
  @ApiProperty({
    description: 'Reason for opening the dispute',
    enum: DisputeReason,
    example: DisputeReason.ITEM_NOT_AS_DESCRIBED,
  })
  @IsEnum(DisputeReason)
  reason: DisputeReason;

  @ApiProperty({
    description: 'Detailed description of the issue (minimum 20 characters)',
    example: 'The laptop screen has a crack that was not mentioned in the listing. The seller did not disclose this damage.',
    minLength: 20,
  })
  @IsString()
  @MinLength(20)
  description: string;

  @ApiPropertyOptional({
    description: 'URLs to evidence images or documents',
    example: ['https://storage.example.com/evidence/photo1.jpg', 'https://storage.example.com/evidence/photo2.jpg'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidence?: string[];
}
