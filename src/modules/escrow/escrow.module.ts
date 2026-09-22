import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { EscrowProcessor } from './escrow.processor';
import { ServiceSchedulingService } from './service-scheduling.service';
import {
  AVAILABILITY_VALIDATOR,
  AlwaysAvailableValidator,
} from './availability/availability-validator';
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import { OrderItem } from '../../database/entities/order-item.entity';
import { ServiceTimeProposal } from '../../database/entities/service-time-proposal.entity';
import { Dispute } from '../../database/entities/dispute.entity';
import { Listing } from '../../database/entities/listing.entity';
import { DeliveryCode } from '../../database/entities/delivery-code.entity';
import { User } from '../../database/entities/user.entity';
import { BuyRequestOffer } from '../../database/entities/buy-request-offer.entity';
import { BuyRequest } from '../../database/entities/buy-request.entity';
import { WalletModule } from '../wallet/wallet.module';
import { UniversitiesModule } from '../universities/universities.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { AdminModule } from '../admin/admin.module';
import { TransactionPinModule } from '../transaction-pin/transaction-pin.module';
import { ESCROW_QUEUE_NAME } from './interfaces/escrow-jobs.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EscrowTransaction,
      OrderItem,
      ServiceTimeProposal,
      Dispute,
      Listing,
      DeliveryCode,
      User,
      BuyRequestOffer,
      BuyRequest,
    ]),
    BullModule.registerQueue({
      name: ESCROW_QUEUE_NAME,
    }),
    WalletModule,
    UniversitiesModule,
    forwardRef(() => NotificationsModule),
    EmailModule,
    AdminModule,
    TransactionPinModule,
  ],
  controllers: [EscrowController],
  providers: [
    EscrowService,
    EscrowProcessor,
    ServiceSchedulingService,
    // The calendar seam (rev-2 spec 05): swap this provider for a real
    // availability implementation later — nothing else changes.
    { provide: AVAILABILITY_VALIDATOR, useClass: AlwaysAvailableValidator },
  ],
  exports: [EscrowService, ServiceSchedulingService],
})
export class EscrowModule {}
