import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet, WalletTransaction } from '../../database/entities/wallet.entity';
import {
  PlatformWallet,
  PlatformWalletTransaction,
} from '../../database/entities/platform-wallet.entity';
import { TransactionCap } from '../../database/entities/transaction-cap.entity';
import { AdminModule } from '../admin/admin.module';
import { WalletService } from './wallet.service';
import { PlatformWalletService } from './platform-wallet.service';
import { VelocityService } from './velocity.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      PlatformWallet,
      PlatformWalletTransaction,
      TransactionCap,
    ]),
    AdminModule,
  ],
  controllers: [WalletController],
  providers: [WalletService, PlatformWalletService, VelocityService],
  exports: [WalletService, PlatformWalletService, VelocityService],
})
export class WalletModule {}
