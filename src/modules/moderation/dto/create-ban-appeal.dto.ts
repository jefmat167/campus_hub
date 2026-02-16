import {
  IsString,
  IsOptional,
  IsArray,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBanAppealDto {
  @ApiProperty({
    description: 'Explanation of why the ban should be lifted',
    example: 'I believe my account was banned in error. The reported listing was legitimate and I have proof of ownership for the item. I have been a trusted seller on the platform for over a year.',
    maxLength: 3000,
  })
  @IsString()
  @MaxLength(3000)
  reason: string;

  @ApiPropertyOptional({
    description: 'URLs to supporting evidence (receipts, photos, etc.)',
    example: ['https://storage.example.com/appeals/receipt.jpg', 'https://storage.example.com/appeals/item-photo.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  evidence?: string[];
}
