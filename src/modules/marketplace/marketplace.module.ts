import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing, ListingImage } from '../../database/entities/listing.entity';
import { BuyRequest } from '../../database/entities/buy-request.entity';
import { BuyRequestOffer } from '../../database/entities/buy-request-offer.entity';
import { Favorite } from '../../database/entities/favorite.entity';
import { Conversation } from '../../database/entities/conversation.entity';
import { User } from '../../database/entities/user.entity';
import { Faculty } from '../../database/entities/faculty.entity';
import { Department } from '../../database/entities/department.entity';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';
import { BuyRequestsController } from './buy-requests.controller';
import { BuyRequestsService } from './buy-requests.service';
import {
  BuyRequestOffersController,
  MyBuyRequestOffersController,
} from './buy-request-offers.controller';
import { BuyRequestOffersService } from './buy-request-offers.service';
import { ChatModule } from '../chat/chat.module';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Listing,
      ListingImage,
      BuyRequest,
      BuyRequestOffer,
      Favorite,
      Conversation,
      User,
      Faculty,
      Department,
    ]),
    ChatModule,
    EscrowModule,
    NotificationsModule,
  ],
  controllers: [
    MarketplaceController,
    BuyRequestsController,
    BuyRequestOffersController,
    MyBuyRequestOffersController,
  ],
  providers: [MarketplaceService, BuyRequestsService, BuyRequestOffersService],
  exports: [MarketplaceService, BuyRequestsService, BuyRequestOffersService],
})
export class MarketplaceModule {}
