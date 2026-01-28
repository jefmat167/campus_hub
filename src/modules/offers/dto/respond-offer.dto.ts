import {
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OfferResponseAction {
  ACCEPT = 'accept',
  REJECT = 'reject',
  COUNTER = 'counter',
}

export class RespondOfferDto {
  @ApiProperty({
    description: 'Response action to the offer',
    enum: OfferResponseAction,
    example: OfferResponseAction.COUNTER,
  })
  @IsEnum(OfferResponseAction)
  action: OfferResponseAction;

  @ApiPropertyOptional({
    description: 'Counter offer amount (required when action is "counter")',
    example: 420000,
    minimum: 100,
    maximum: 10000000,
  })
  @ValidateIf((o) => o.action === OfferResponseAction.COUNTER)
  @IsNumber()
  @Min(100)
  @Max(10000000)
  counterAmount?: number;

  @ApiPropertyOptional({
    description: 'Optional message to the buyer',
    example: 'I can do 420k, that is my final price.',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  message?: string;
}
