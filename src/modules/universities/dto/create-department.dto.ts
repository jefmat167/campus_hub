import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, MinLength, MaxLength } from 'class-validator';

export class CreateDepartmentDto {
  @ApiProperty({ example: 'Computer Science' })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'CSC' })
  @IsString()
  @MinLength(2)
  @MaxLength(20)
  code: string;

  @ApiProperty()
  @IsUUID()
  facultyId: string;
}
