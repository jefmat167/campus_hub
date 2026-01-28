import {
  IsUUID,
  IsEnum,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '../../../database/entities/conversation.entity';

export class CreateConversationDto {
  @ApiPropertyOptional({
    description: 'Type of conversation',
    enum: ConversationType,
    default: ConversationType.LISTING_INQUIRY,
    example: ConversationType.LISTING_INQUIRY,
  })
  @IsEnum(ConversationType)
  @IsOptional()
  type?: ConversationType = ConversationType.LISTING_INQUIRY;

  @ApiPropertyOptional({
    description: 'UUID of the listing this conversation is about (for listing inquiries)',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  listingId?: string;

  @ApiProperty({
    description: 'UUID of the user to start conversation with',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  recipientId: string;
}
