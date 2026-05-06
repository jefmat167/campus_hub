import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

export class CreateFacultyDto {
  @ApiProperty({ example: 'Faculty of Engineering' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'ENG' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty()
  @IsUUID()
  universityId: string;
}
