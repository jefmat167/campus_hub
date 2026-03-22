import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { EscrowProcessor } from './escrow.processor';
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { Listing } from '../../database/entities/listing.entity';
import { DeliveryCode } from '../../database/entities/delivery-code.entity';
import { University } from '../../database/entities/university.entity';
import { User } from '../../database/entities/user.entity';
import { BuyRequestOffer } from '../../database/entities/buy-request-offer.entity';
import { BuyRequest } from '../../database/entities/buy-request.entity';
import { WalletModule } from '../wallet/wallet.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { ESCROW_QUEUE_NAME } from './interfaces/escrow-jobs.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EscrowTransaction,
      Dispute,
      Listing,
      DeliveryCode,
      University,
      User,
      BuyRequestOffer,
      BuyRequest,
    ]),
    BullModule.registerQueue({
      name: ESCROW_QUEUE_NAME,
    }),
    WalletModule,
    forwardRef(() => NotificationsModule),
    EmailModule,
  ],
  controllers: [EscrowController],
  providers: [EscrowService, EscrowProcessor],
  exports: [EscrowService],
})
export class EscrowModule {}
