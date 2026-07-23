import { IsEnum, IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BuyRequestOfferResponseAction {
  ACCEPT = 'accept',
  REJECT = 'reject',
}

export class RespondBuyRequestOfferDto {
  @ApiProperty({
    description: 'Response action to the offer',
    enum: BuyRequestOfferResponseAction,
    example: BuyRequestOfferResponseAction.ACCEPT,
  })
  @IsEnum(BuyRequestOfferResponseAction)
  action: BuyRequestOfferResponseAction;

  @ApiPropertyOptional({
    description: 'Optional message to the responder',
    example: 'Great, this is exactly what I needed!',
    maxLength: 500,
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  @Transform(({ value }) => value?.trim())
  message?: string;

  @ApiPropertyOptional({
    description: 'Your 6-digit transaction PIN (required when action = accept)',
    example: '135790',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'PIN must be exactly 6 digits' })
  pin?: string;
}
