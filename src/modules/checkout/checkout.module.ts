import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from '../../database/entities/listing.entity';
import { Offer } from '../../database/entities/offer.entity';
import { Checkout } from '../../database/entities/checkout.entity';
import { VendorListing } from '../../database/entities/vendor-listing.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { CartModule } from '../cart/cart.module';
import { EscrowModule } from '../escrow/escrow.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionPinModule } from '../transaction-pin/transaction-pin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Listing,
      Offer,
      Checkout,
      VendorListing,
      VendorUniversity,
      DropPoint,
    ]),
    CartModule,
    EscrowModule,
    WalletModule,
    TransactionPinModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
