import { IsEnum, IsString, IsOptional, MaxLength } from 'class-validator';
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
}
