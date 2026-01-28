import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HousingController } from './housing.controller';
import { RoommateController } from './roommate.controller';
import { HousingService } from './housing.service';
import { RoommateService } from './roommate.service';
import { HousingListing } from '../../database/entities/housing.entity';
import {
  RoommateProfile,
  RoommateInterest,
} from '../../database/entities/roommate.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      HousingListing,
      RoommateProfile,
      RoommateInterest,
    ]),
  ],
  controllers: [HousingController, RoommateController],
  providers: [HousingService, RoommateService],
  exports: [HousingService, RoommateService],
})
export class HousingModule {}
