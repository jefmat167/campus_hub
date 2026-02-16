import { IsEnum, IsString, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DocumentType } from '../../../database/entities/verification-document.entity';

export class UploadDocumentDto {
  @ApiProperty({
    description: 'Type of verification document',
    enum: DocumentType,
    example: DocumentType.STUDENT_ID_FRONT,
  })
  @IsEnum(DocumentType)
  @IsNotEmpty()
  type: DocumentType;

  @ApiProperty({
    description: 'URL to the uploaded document image',
    example: 'https://storage.example.com/documents/student-id-front.jpg',
  })
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  documentUrl: string;

  @ApiPropertyOptional({
    description: 'Additional metadata about the document',
    example: { studentId: '2020/12345', faculty: 'Engineering' },
  })
  @IsOptional()
  metadata?: Record<string, unknown>;
}
