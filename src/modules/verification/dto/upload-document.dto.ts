import { IsEnum, IsString, IsNotEmpty, IsUrl, IsOptional } from 'class-validator';
import { DocumentType } from '../../../database/entities/verification-document.entity';

export class UploadDocumentDto {
  @IsEnum(DocumentType)
  @IsNotEmpty()
  type: DocumentType;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  documentUrl: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
