import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import {
  VendorListing,
  VendorListingImage,
} from '../../database/entities/vendor-listing.entity';
import {
  VendorOption,
  VendorOptionGroup,
} from '../../database/entities/vendor-option.entity';
import { VendorListingFulfillment } from '../../database/entities/vendor-listing-fulfillment.entity';
import { VendorsService } from './vendors.service';
import { VendorCatalogService } from './vendor-catalog.service';
import { VendorMarketService } from './vendor-market.service';
import { VendorsController } from './vendors.controller';
import { VendorAdminController } from './vendor-admin.controller';
import { VendorCatalogController } from './vendor-catalog.controller';
import { VendorMarketController } from './vendor-market.controller';
import { VendorGuard } from './vendor.guard';
import { UniversitiesModule } from '../universities/universities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VendorProfile,
      VendorUniversity,
      VendorListing,
      VendorListingImage,
      VendorOptionGroup,
      VendorOption,
      VendorListingFulfillment,
    ]),
    UniversitiesModule,
    NotificationsModule,
    AdminModule,
    UploadModule,
  ],
  controllers: [
    VendorsController,
    VendorCatalogController,
    VendorMarketController,
    VendorAdminController,
  ],
  providers: [VendorsService, VendorCatalogService, VendorMarketService, VendorGuard],
  exports: [
    VendorsService,
    VendorCatalogService,
    VendorMarketService,
    VendorGuard,
    TypeOrmModule,
  ],
})
export class VendorsModule {}
