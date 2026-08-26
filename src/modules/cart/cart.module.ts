import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart, CartItem } from '../../database/entities/cart.entity';
import { Listing } from '../../database/entities/listing.entity';
import { Offer } from '../../database/entities/offer.entity';
import { VendorListing } from '../../database/entities/vendor-listing.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cart,
      CartItem,
      Listing,
      Offer,
      VendorListing,
      VendorUniversity,
    ]),
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
