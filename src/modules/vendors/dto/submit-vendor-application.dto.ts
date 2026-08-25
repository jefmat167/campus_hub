import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsUrl, MaxLength } from 'class-validator';

/**
 * Completes (or resubmits after rejection) a vendor application:
 * DRAFT | REJECTED → PENDING_REVIEW. Door-2 accounts register first and
 * attach the live shopfront photo here, once they can upload.
 */
export class SubmitVendorApplicationDto {
  @ApiProperty({
    description: 'Live-captured shopfront photo (uploaded via /upload first)',
    maxLength: 500,
  })
  @IsUrl()
  @MaxLength(500)
  shopfrontPhotoUrl: string;

  @ApiProperty({
    description:
      'Must be true — the shopfront photo has to be captured live in-app (rev-2 spec 03.1)',
    example: true,
  })
  @IsBoolean()
  @Equals(true, {
    message: 'The shopfront photo must be captured live in-app',
  })
  photoCapturedLive: boolean;
}
