import { IsEnum, IsString, IsArray, IsOptional } from 'class-validator';
import { ReactionType } from '../../../database/entities/post.entity';

export class ReactToPostDto {
  @IsEnum(ReactionType)
  type: ReactionType;
}

export class VotePollDto {
  @IsString()
  optionId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  optionIds?: string[]; // For multiple votes if allowed
}
