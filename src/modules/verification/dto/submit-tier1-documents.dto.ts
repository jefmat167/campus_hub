import {
  IsString,
  IsNotEmpty,
  IsUrl,
  IsOptional,
  IsEmail,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for submitting Tier 1 verification documents
 *
 * Required documents:
 * - Student ID card (front and back)
 * - School fees receipt of current session
 *
 * Optional:
 * - School-issued email address (if provided, must be verified)
 */
export class SubmitTier1DocumentsDto {
  @ApiProperty({
    description: 'URL to uploaded student ID card (front side)',
    example: 'https://storage.example.com/verification/student-id-front.jpg',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  studentIdFrontUrl: string;

  @ApiProperty({
    description: 'URL to uploaded student ID card (back side)',
    example: 'https://storage.example.com/verification/student-id-back.jpg',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  studentIdBackUrl: string;

  @ApiProperty({
    description: 'URL to uploaded school fees receipt (current session)',
    example: 'https://storage.example.com/verification/school-fees-receipt.pdf',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  schoolFeesReceiptUrl: string;

  @ApiPropertyOptional({
    description: 'School-issued email address (if available). A verification email will be sent.',
    example: 'john.doe@students.unilag.edu.ng',
  })
  @IsOptional()
  @ValidateIf((o) => o.schoolEmail !== undefined && o.schoolEmail !== '')
  @IsEmail({}, { message: 'Please provide a valid school email address' })
  schoolEmail?: string;
}
