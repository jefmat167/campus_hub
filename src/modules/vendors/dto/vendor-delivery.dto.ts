import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Vendor delivery PRESET (2026-09-21 amendment to spec 03.2): configured once
 * per served campus, inherited by every listing. Fees are naira (0 = free);
 * `null` / omitted = that option is not offered.
 */
export class VendorDeliveryPointInputDto {
  @ApiProperty({
    description: 'An ACTIVE admin drop point at that university',
    format: 'uuid',
  })
  @IsUUID()
  dropPointId: string;

  @ApiProperty({
    description: 'Delivery fee to this drop point in naira (0 = free)',
    example: 300,
  })
  @IsNumber()
  @Min(0)
  @Max(1000000)
  fee: number;
}

export class VendorDeliveryCampusDto {
  @ApiProperty({ description: 'A university this vendor serves', format: 'uuid' })
  @IsUUID()
  universityId: string;

  @ApiPropertyOptional({
    description:
      'Door delivery (to the student’s own address) fee in naira — HOME campus only; null/omitted = not offered',
    example: 500,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  doorDeliveryFee?: number | null;

  @ApiPropertyOptional({
    description:
      'Travel fee in naira when the vendor comes to the student for a SERVICE; null/omitted = at-the-shop only',
    example: 1000,
    nullable: true,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1000000)
  serviceTravelFee?: number | null;

  @ApiProperty({
    description: 'Admin drop points the vendor delivers GOODS to on this campus (≤ 3), each with its fee',
    type: [VendorDeliveryPointInputDto],
    maxItems: 3,
  })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VendorDeliveryPointInputDto)
  dropPoints: VendorDeliveryPointInputDto[];
}

export class ReplaceVendorDeliveryDto {
  @ApiProperty({
    description:
      'Full replacement set, one entry per served campus you want delivery on (⊆ served, no duplicates). A served campus left out becomes pickup-only.',
    type: [VendorDeliveryCampusDto],
    maxItems: 3,
  })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => VendorDeliveryCampusDto)
  universities: VendorDeliveryCampusDto[];
}
