import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { User } from '../../database/entities/user.entity';
import { Listing } from '../../database/entities/listing.entity';
import { HousingListing } from '../../database/entities/housing.entity';
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import { Wallet, WalletTransaction } from '../../database/entities/wallet.entity';
import { Warning } from '../../database/entities/warning.entity';
import { Report } from '../../database/entities/report.entity';
import { RoommateProfile } from '../../database/entities/roommate.entity';
import { VerificationDocument } from '../../database/entities/verification-document.entity';
import { KycVerification } from '../../database/entities/kyc-verification.entity';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { SmsModule } from '../sms/sms.module';
import { EmailModule } from '../email/email.module';
import { AdminModule } from '../admin/admin.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AdminUsersController } from './admin-users.controller';
import { UsersProcessor } from './users.processor';
import { USERS_QUEUE_NAME } from './interfaces/users-jobs.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Listing,
      HousingListing,
      EscrowTransaction,
      Wallet,
      WalletTransaction,
      Warning,
      Report,
      RoommateProfile,
      VerificationDocument,
      KycVerification,
      EmailVerification,
    ]),
    BullModule.registerQueue({
      name: USERS_QUEUE_NAME,
    }),
    SmsModule,
    EmailModule,
    AdminModule,
  ],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, UsersProcessor],
  exports: [UsersService],
})
export class UsersModule {}
