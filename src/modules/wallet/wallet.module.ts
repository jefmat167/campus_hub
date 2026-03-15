import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Wallet, WalletTransaction } from '../../database/entities/wallet.entity';
import {
  PlatformWallet,
  PlatformWalletTransaction,
} from '../../database/entities/platform-wallet.entity';
import { WalletService } from './wallet.service';
import { PlatformWalletService } from './platform-wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Wallet,
      WalletTransaction,
      PlatformWallet,
      PlatformWalletTransaction,
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService, PlatformWalletService],
  exports: [WalletService, PlatformWalletService],
})
export class WalletModule {}
