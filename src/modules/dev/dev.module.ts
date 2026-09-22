import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DevController } from './dev.controller';
import { User } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { VendorDeliveryPoint } from '../../database/entities/vendor-delivery-point.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';

/**
 * Development module for testing verification flows.
 * Provides endpoints to quickly set user tiers and bypass verification.
 * All endpoints are disabled in production.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Wallet,
      VendorProfile,
      VendorUniversity,
      VendorDeliveryPoint,
      DropPoint,
    ]),
    ConfigModule,
  ],
  controllers: [DevController],
})
export class DevModule {}
