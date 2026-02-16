import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ModerationStatus } from '../../../database/entities/moderation-queue.entity';

export class ReviewQueueItemDto {
  @ApiProperty({
    description: 'Review decision for the flagged content',
    enum: [ModerationStatus.APPROVED, ModerationStatus.REJECTED, ModerationStatus.REMOVED],
    example: ModerationStatus.REMOVED,
  })
  @IsEnum(ModerationStatus, {
    message: 'Status must be approved, rejected, or removed',
  })
  status: ModerationStatus.APPROVED | ModerationStatus.REJECTED | ModerationStatus.REMOVED;

  @ApiPropertyOptional({
    description: 'Notes explaining the review decision',
    example: 'Content contains prohibited keywords and was flagged correctly by AI.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;

  @ApiPropertyOptional({
    description: 'Description of action taken (e.g., "content removed", "user warned")',
    example: 'Content removed and warning issued to user.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionTaken?: string;
}
