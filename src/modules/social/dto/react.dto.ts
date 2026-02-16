import { IsEnum, IsString, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReactionType } from '../../../database/entities/post.entity';

export class ReactToPostDto {
  @ApiProperty({
    description: 'Type of reaction to add (toggles if already reacted)',
    enum: ReactionType,
    example: ReactionType.LIKE,
  })
  @IsEnum(ReactionType)
  type: ReactionType;
}

export class VotePollDto {
  @ApiProperty({
    description: 'ID of the poll option to vote for',
    example: 'option_1',
  })
  @IsString()
  optionId: string;

  @ApiPropertyOptional({
    description: 'Array of option IDs (for polls that allow multiple votes)',
    example: ['option_1', 'option_3'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  optionIds?: string[];
}
