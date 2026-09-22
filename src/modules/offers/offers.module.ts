import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Offer } from '../../database/entities/offer.entity';
import { Listing } from '../../database/entities/listing.entity';
import { User } from '../../database/entities/user.entity';
import { OffersController } from './offers.controller';
import { OffersService } from './offers.service';
import { OffersProcessor } from './offers.processor';
import { NotificationsModule } from '../notifications/notifications.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { OFFERS_QUEUE_NAME } from './interfaces/offers-jobs.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([Offer, Listing, User]),
    BullModule.registerQueue({ name: OFFERS_QUEUE_NAME }),
    NotificationsModule,
    // For the buy-request half of the expiry sweep (OffersProcessor).
    // Nothing under MarketplaceModule imports OffersModule, so no cycle.
    MarketplaceModule,
  ],
  controllers: [OffersController],
  providers: [OffersService, OffersProcessor],
  exports: [OffersService],
})
export class OffersModule {}
