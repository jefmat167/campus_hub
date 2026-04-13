import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HousingController } from './housing.controller';
import { RoommateController } from './roommate.controller';
import { HousingService } from './housing.service';
import { RoommateService } from './roommate.service';
import { HousingProcessor } from './housing.processor';
import { HousingListing } from '../../database/entities/housing.entity';
import { HousingReport } from '../../database/entities/housing-report.entity';
import {
  RoommateProfile,
  RoommateInterest,
} from '../../database/entities/roommate.entity';
import { HOUSING_QUEUE_NAME } from './interfaces/housing-jobs.interface';

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
  controllers: [HousingController, RoommateController],
  providers: [HousingService, RoommateService, HousingProcessor],
  exports: [HousingService, RoommateService],
})
export class HousingModule {}
