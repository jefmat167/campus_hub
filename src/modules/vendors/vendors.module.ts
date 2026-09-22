import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { Listing, ListingImage } from '../../database/entities/listing.entity';
import {
  VendorOption,
  VendorOptionGroup,
} from '../../database/entities/vendor-option.entity';
import { VendorDeliveryPoint } from '../../database/entities/vendor-delivery-point.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';
import { VendorsService } from './vendors.service';
import { VendorCatalogService } from './vendor-catalog.service';
import { VendorMarketService } from './vendor-market.service';
import { VendorDeliveryService } from './vendor-delivery.service';
import { VendorsController } from './vendors.controller';
import { VendorAdminController } from './vendor-admin.controller';
import { VendorCatalogController } from './vendor-catalog.controller';
import { VendorMarketController } from './vendor-market.controller';
import { VendorGuard } from './vendor.guard';
import { UniversitiesModule } from '../universities/universities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';
import { UploadModule } from '../upload/upload.module';
import { EscrowModule } from '../escrow/escrow.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendorProfile,
      VendorUniversity,
      Listing,
      ListingImage,
      VendorOptionGroup,
      VendorOption,
      VendorDeliveryPoint,
      DropPoint,
    ]),
    UniversitiesModule,
    NotificationsModule,
    AdminModule,
    UploadModule,
    EscrowModule,
  ],
  controllers: [
    VendorsController,
    VendorCatalogController,
    VendorMarketController,
    VendorAdminController,
  ],
  providers: [
    VendorsService,
    VendorCatalogService,
    VendorMarketService,
    VendorDeliveryService,
    VendorGuard,
  ],
  exports: [
    VendorsService,
    VendorCatalogService,
    VendorMarketService,
    VendorDeliveryService,
    VendorGuard,
    TypeOrmModule,
  ],
})
export class VendorsModule {}
