import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsUUID,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @IsUUID()
  @IsOptional()
  parentId?: string; // For replies to comments
}
