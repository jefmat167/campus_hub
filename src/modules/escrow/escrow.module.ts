import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { Listing } from '../../database/entities/listing.entity';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EscrowTransaction, Dispute, Listing]),
    WalletModule,
  ],
  controllers: [EscrowController],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
