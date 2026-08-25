import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorProfile } from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { VendorAdminController } from './vendor-admin.controller';
import { VendorGuard } from './vendor.guard';
import { UniversitiesModule } from '../universities/universities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorProfile, VendorUniversity]),
    UniversitiesModule,
    NotificationsModule,
    AdminModule,
  ],
  controllers: [VendorsController, VendorAdminController],
  providers: [VendorsService, VendorGuard],
  exports: [VendorsService, VendorGuard, TypeOrmModule],
})
export class VendorsModule {}
