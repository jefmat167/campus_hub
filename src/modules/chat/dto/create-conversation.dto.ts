import {
  IsUUID,
  IsEnum,
  IsOptional,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConversationType } from '../../../database/entities/conversation.entity';

export class CreateConversationDto {
  @ApiPropertyOptional({
    description: 'Type of conversation (auto-determined if listingId or housingListingId is provided)',
    enum: ConversationType,
    example: ConversationType.LISTING_INQUIRY,
  })
  @IsEnum(ConversationType)
  @IsOptional()
  type?: ConversationType;

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
    description: 'UUID of the user to start conversation with',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID()
  recipientId: string;
}
