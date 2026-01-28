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
import {
  Gender,
  CleanlinessLevel,
  NoiseLevel,
  SleepSchedule,
  StudyHabit,
} from '../../../database/entities/roommate.entity';

export class CreateRoommateProfileDto {
  @IsEnum(Gender)
  gender: Gender;

  @IsNumber()
  @Min(16)
  @Max(50)
  age: number;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  bio?: string;

  @IsNumber()
  @Min(0)
  budgetMin: number;

  @IsNumber()
  @Min(0)
  budgetMax: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredAreas?: string[];

  @IsDateString()
  @IsOptional()
  moveInDate?: string;

  @IsBoolean()
  @IsOptional()
  moveInFlexible?: boolean;

  // Living habits
  @IsEnum(CleanlinessLevel)
  @IsOptional()
  cleanliness?: CleanlinessLevel;

  @IsEnum(NoiseLevel)
  @IsOptional()
  noiseLevel?: NoiseLevel;

  @IsEnum(SleepSchedule)
  @IsOptional()
  sleepSchedule?: SleepSchedule;

  @IsEnum(StudyHabit)
  @IsOptional()
  studyHabit?: StudyHabit;

  @IsBoolean()
  @IsOptional()
  smokes?: boolean;

  @IsBoolean()
  @IsOptional()
  drinks?: boolean;

  @IsBoolean()
  @IsOptional()
  hasPets?: boolean;

  @IsBoolean()
  @IsOptional()
  allowsVisitors?: boolean;

  // Roommate preferences
  @IsEnum(Gender)
  @IsOptional()
  preferredGender?: Gender;

  @IsNumber()
  @Min(16)
  @Max(50)
  @IsOptional()
  preferredAgeMin?: number;

  @IsNumber()
  @Min(16)
  @Max(50)
  @IsOptional()
  preferredAgeMax?: number;

  @IsEnum(CleanlinessLevel)
  @IsOptional()
  preferredCleanliness?: CleanlinessLevel;

  @IsEnum(NoiseLevel)
  @IsOptional()
  preferredNoiseLevel?: NoiseLevel;

  @IsEnum(SleepSchedule)
  @IsOptional()
  preferredSleepSchedule?: SleepSchedule;

  @IsBoolean()
  @IsOptional()
  nonSmokerOnly?: boolean;

  @IsBoolean()
  @IsOptional()
  nonDrinkerOnly?: boolean;

  @IsBoolean()
  @IsOptional()
  noPetsAllowed?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  interests?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];
}

export class ExpressInterestDto {
  @IsString()
  @MaxLength(500)
  @IsOptional()
  message?: string;
}
