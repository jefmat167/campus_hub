import {
  IsUUID,
  IsString,
  IsArray,
  IsUrl,
  IsOptional,
  MaxLength,
  ArrayMaxSize,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({
    description: 'UUID of the conversation to send message to',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  conversationId: string;

  @ApiProperty({
    description: 'Message content',
    example: 'Hi! Is this item still available?',
    maxLength: 5000,
  })
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  content: string;

  @ApiPropertyOptional({
    description: 'Array of attachment URLs (images)',
    example: ['https://storage.example.com/attachments/img1.jpg'],
    type: [String],
    maxItems: 5,
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  @IsOptional()
  attachments?: string[];
}

export class StartConversationWithMessageDto {
  @ApiPropertyOptional({
    description: 'UUID of the marketplace listing (mutually exclusive with other listing types)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  @ValidateIf((o) => !o.housingListingId && !o.buyRequestId && !o.roommateProfileId)
  listingId?: string;

  @ApiPropertyOptional({
    description: 'UUID of the housing listing (mutually exclusive with other listing types). Requires TIER_1.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  @ValidateIf((o) => !o.listingId && !o.buyRequestId && !o.roommateProfileId)
  housingListingId?: string;

  @ApiPropertyOptional({
    description: 'UUID of a buy request (for sellers responding to a buy request)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  @ValidateIf((o) => !o.listingId && !o.housingListingId && !o.roommateProfileId)
  buyRequestId?: string;

  @ApiPropertyOptional({
    description: 'UUID of a roommate profile (for inquiring about a potential roommate). Requires TIER_1 and same university.',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  @ValidateIf((o) => !o.listingId && !o.housingListingId && !o.buyRequestId)
  roommateProfileId?: string;

  @ApiProperty({
    description: 'UUID of the user to message',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  recipientId: string;

  @ApiProperty({
    description: 'Initial message content',
    example: 'Hi! I am interested in your iPhone listing. Is it still available?',
    maxLength: 5000,
  })
  @IsString()
  @MaxLength(5000)
  @Transform(({ value }) => value?.trim())
  content: string;

  @ApiPropertyOptional({
    description: 'Array of attachment URLs',
    example: [],
    type: [String],
    maxItems: 5,
  })
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  @IsOptional()
  attachments?: string[];
}
