import {
  IsEnum,
  IsString,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { ModerationStatus } from '../../../database/entities/moderation-queue.entity';

export class ReviewQueueItemDto {
  @IsEnum(ModerationStatus, {
    message: 'Status must be approved, rejected, or removed',
  })
  status: ModerationStatus.APPROVED | ModerationStatus.REJECTED | ModerationStatus.REMOVED;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewNotes?: string;

  // Action taken (e.g., "content removed", "user warned", etc.)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  actionTaken?: string;
}
