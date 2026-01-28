import {
  IsUUID,
  IsNumber,
  IsPositive,
  IsOptional,
  IsString,
} from 'class-validator';

export class InitiateEscrowDto {
  @IsUUID()
  listingId: string;

  @IsUUID()
  @IsOptional()
  offerId?: string;

  @IsNumber()
  @IsPositive()
  amount: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
