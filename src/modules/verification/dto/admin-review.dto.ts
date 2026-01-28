import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for rejecting a Tier 1 verification
 */
export class RejectVerificationDto {
  @ApiProperty({
    description: 'Reason for rejecting the verification',
    example: 'The student ID is not clearly visible. Please upload a clearer image.',
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Rejection reason must be at least 10 characters' })
  reason: string;
}
