import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Door 2 (rev-2 spec 03.1): an external business with no prior CampusHub
 * account. Creates a vendor-only account (accountType = 'vendor', no academic
 * identity) plus a DRAFT vendor profile. The live shopfront photo can't be
 * uploaded pre-auth, so the application is completed afterwards via
 * POST /vendors/me/submit — mirroring the Tier-1 student-docs flow.
 */
export class RegisterVendorDto {
  @ApiProperty({
    description: 'Public storefront name',
    example: "Mama T's Kitchen",
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  businessName: string;

  @ApiProperty({
    description: 'Full name of the business contact person',
    example: 'Titi Adeyemi',
    minLength: 2,
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  contactName: string;

  @ApiProperty({
    description: 'Business email address',
    example: 'orders@mamats.ng',
  })
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ApiProperty({
    description: 'Nigerian phone number',
    example: '+2348012345678',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+?234|0)?[789][01]\d{8}$/, {
    message: 'Please provide a valid Nigerian phone number',
  })
  phone: string;

  @ApiProperty({
    description:
      'Password (min 8 chars, must include uppercase, lowercase, and number)',
    example: 'SecurePass123',
    minLength: 8,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message:
      'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password: string;

  @ApiProperty({
    description:
      'Where the shop physically is — must be one of servedUniversityIds',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  homeUniversityId: string;

  @ApiProperty({
    description: 'The 1–3 universities this vendor serves (must include home)',
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  @IsUUID(undefined, { each: true })
  servedUniversityIds: string[];

  @ApiPropertyOptional({
    description: 'What the business sells / does',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description:
      'Human directions to the shop — shown to buyers as the pickup location',
    example: 'Shop 4, Mama T Plaza, opposite the main gate',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shopAddress?: string;

  @ApiPropertyOptional({
    description: 'Device identifier (ban enforcement)',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
