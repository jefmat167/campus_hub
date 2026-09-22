import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Listing } from '../../database/entities/listing.entity';
import { Offer } from '../../database/entities/offer.entity';
import { Checkout } from '../../database/entities/checkout.entity';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { CartModule } from '../cart/cart.module';
import { EscrowModule } from '../escrow/escrow.module';
import { WalletModule } from '../wallet/wallet.module';
import { TransactionPinModule } from '../transaction-pin/transaction-pin.module';
// VendorsModule never imports Cart/Checkout, so no cycle — it supplies the
// per-vendor delivery preset resolver that prices vendor sub-orders.
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Listing, Offer, Checkout]),
    CartModule,
    EscrowModule,
    WalletModule,
    TransactionPinModule,
    VendorsModule,
  ],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}
