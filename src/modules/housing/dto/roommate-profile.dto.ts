import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  IsOptional,
  IsDateString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Gender,
  CleanlinessLevel,
  NoiseLevel,
  SleepSchedule,
  StudyHabit,
} from '../../../database/entities/roommate.entity';

export class CreateRoommateProfileDto {
  @ApiProperty({
    description: 'Your gender',
    enum: Gender,
    example: Gender.MALE,
  })
  @IsEnum(Gender)
  gender: Gender;

  @ApiProperty({
    description: 'Your age (16-50)',
    example: 21,
    minimum: 16,
    maximum: 50,
  })
  @IsNumber()
  @Min(16)
  @Max(50)
  age: number;

  @ApiPropertyOptional({
    description: 'Brief bio about yourself',
    example: 'Final year Computer Science student. I enjoy coding, gaming, and keeping my space tidy.',
    maxLength: 1000,
  })
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  bio?: string;

  @ApiProperty({
    description: 'Minimum monthly budget in Naira',
    example: 20000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  budgetMin: number;

  @ApiProperty({
    description: 'Maximum monthly budget in Naira',
    example: 40000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  budgetMax: number;

  @ApiPropertyOptional({
    description: 'Preferred areas/neighborhoods',
    example: ['Akoka', 'Yaba', 'Bariga'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredAreas?: string[];

  @ApiPropertyOptional({
    description: 'Desired move-in date (ISO 8601)',
    example: '2024-03-01',
  })
  @IsDateString()
  @IsOptional()
  moveInDate?: string;

  @ApiPropertyOptional({
    description: 'Whether move-in date is flexible',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  moveInFlexible?: boolean;

  @ApiPropertyOptional({
    description: 'Your cleanliness level',
    enum: CleanlinessLevel,
    example: CleanlinessLevel.CLEAN,
  })
  @IsEnum(CleanlinessLevel)
  @IsOptional()
  cleanliness?: CleanlinessLevel;

  @ApiPropertyOptional({
    description: 'Your noise preference',
    enum: NoiseLevel,
    example: NoiseLevel.MODERATE,
  })
  @IsEnum(NoiseLevel)
  @IsOptional()
  noiseLevel?: NoiseLevel;

  @ApiPropertyOptional({
    description: 'Your typical sleep schedule',
    enum: SleepSchedule,
    example: SleepSchedule.NIGHT_OWL,
  })
  @IsEnum(SleepSchedule)
  @IsOptional()
  sleepSchedule?: SleepSchedule;

  @ApiPropertyOptional({
    description: 'Your study habits',
    enum: StudyHabit,
    example: StudyHabit.QUIET_STUDIER,
  })
  @IsEnum(StudyHabit)
  @IsOptional()
  studyHabit?: StudyHabit;

  @ApiPropertyOptional({
    description: 'Do you smoke?',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  smokes?: boolean;

  @ApiPropertyOptional({
    description: 'Do you drink alcohol?',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  drinks?: boolean;

  @ApiPropertyOptional({
    description: 'Do you have pets?',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  hasPets?: boolean;

  @ApiPropertyOptional({
    description: 'Do you allow visitors?',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  allowsVisitors?: boolean;

  @ApiPropertyOptional({
    description: 'Preferred roommate gender',
    enum: Gender,
    example: Gender.MALE,
  })
  @IsEnum(Gender)
  @IsOptional()
  preferredGender?: Gender;

  @ApiPropertyOptional({
    description: 'Minimum preferred roommate age',
    example: 18,
    minimum: 16,
    maximum: 50,
  })
  @IsNumber()
  @Min(16)
  @Max(50)
  @IsOptional()
  preferredAgeMin?: number;

  @ApiPropertyOptional({
    description: 'Maximum preferred roommate age',
    example: 25,
    minimum: 16,
    maximum: 50,
  })
  @IsNumber()
  @Min(16)
  @Max(50)
  @IsOptional()
  preferredAgeMax?: number;

  @ApiPropertyOptional({
    description: 'Preferred cleanliness level of roommate',
    enum: CleanlinessLevel,
    example: CleanlinessLevel.CLEAN,
  })
  @IsEnum(CleanlinessLevel)
  @IsOptional()
  preferredCleanliness?: CleanlinessLevel;

  @ApiPropertyOptional({
    description: 'Preferred noise level of roommate',
    enum: NoiseLevel,
    example: NoiseLevel.QUIET,
  })
  @IsEnum(NoiseLevel)
  @IsOptional()
  preferredNoiseLevel?: NoiseLevel;

  @ApiPropertyOptional({
    description: 'Preferred sleep schedule of roommate',
    enum: SleepSchedule,
    example: SleepSchedule.FLEXIBLE,
  })
  @IsEnum(SleepSchedule)
  @IsOptional()
  preferredSleepSchedule?: SleepSchedule;

  @ApiPropertyOptional({
    description: 'Only match with non-smokers',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  nonSmokerOnly?: boolean;

  @ApiPropertyOptional({
    description: 'Only match with non-drinkers',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  nonDrinkerOnly?: boolean;

  @ApiPropertyOptional({
    description: 'No pets allowed',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  noPetsAllowed?: boolean;

  @ApiPropertyOptional({
    description: 'Your interests/hobbies',
    example: ['Gaming', 'Football', 'Movies', 'Coding'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  interests?: string[];

  @ApiPropertyOptional({
    description: 'Languages you speak',
    example: ['English', 'Yoruba'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}

export class ExpressInterestDto {
  @ApiPropertyOptional({
    description: 'Optional message to send with your interest',
    example: 'Hi! I saw your profile and I think we would be great roommates. I am also looking for a place in Akoka.',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  message?: string;
}

export class SearchRoommateProfilesDto {
  @ApiPropertyOptional({
    description: 'Filter by gender',
    enum: Gender,
    example: Gender.MALE,
  })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({
    description: 'Minimum budget in Naira (filters profiles with budgetMax >= this value)',
    example: 20000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  minBudget?: number;

  @ApiPropertyOptional({
    description: 'Maximum budget in Naira (filters profiles with budgetMin <= this value)',
    example: 50000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : undefined))
  maxBudget?: number;

  @ApiPropertyOptional({
    description: 'Filter by preferred area (matches against preferredAreas array)',
    example: 'Akoka',
  })
  @IsString()
  @IsOptional()
  area?: string;

  @ApiPropertyOptional({
    description: 'Page number for pagination',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : 1))
  page?: number;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    minimum: 1,
    default: 20,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Transform(({ value }) => (value ? Number(value) : 20))
  limit?: number;
}
