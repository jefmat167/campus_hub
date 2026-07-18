import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
// ARCHIVED (see note below): apartment-listing HTTP surface + expiry cron.
// import { HousingController } from './housing.controller';
import { RoommateController } from './roommate.controller';
import { HousingService } from './housing.service';
import { RoommateService } from './roommate.service';
// import { HousingProcessor } from './housing.processor';
import { HousingListing } from '../../database/entities/housing.entity';
import { HousingReport } from '../../database/entities/housing-report.entity';
import {
  RoommateProfile,
  RoommateInterest,
} from '../../database/entities/roommate.entity';
import { HOUSING_QUEUE_NAME } from './interfaces/housing-jobs.interface';

/**
 * Apartment-listing functionality is ARCHIVED pending a redesign (product
 * decision, 2026-07-18). The implementation is intentionally kept in the repo
 * — HousingController, HousingProcessor, HousingService, the entities, and the
 * schema all remain — but the listings HTTP routes and the expiry cron are no
 * longer wired up, so users can't create or browse apartment listings.
 *
 * Still active: roommate matching (RoommateController / RoommateService).
 * HousingService stays registered + exported because ChatService depends on it
 * (housing-inquiry conversation counter).
 *
 * To restore: uncomment the HousingController / HousingProcessor imports and
 * re-add them to `controllers` / `providers` below.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      HousingListing,
      HousingReport,
      RoommateProfile,
      RoommateInterest,
    ]),
    BullModule.registerQueue({ name: HOUSING_QUEUE_NAME }),
  ],
  controllers: [
    // HousingController, // ARCHIVED — apartment listings disabled
    RoommateController,
  ],
  providers: [
    HousingService,
    RoommateService,
    // HousingProcessor, // ARCHIVED — apartment-listing expiry cron disabled
  ],
  exports: [HousingService, RoommateService],
})
export class HousingModule {}
