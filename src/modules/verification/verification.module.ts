import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { VerificationDocument } from '../../database/entities/verification-document.entity';
import { KycVerification } from '../../database/entities/kyc-verification.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { VerificationService } from './verification.service';
import { VerificationController } from './verification.controller';
import { EmailModule } from '../email/email.module';
import { YouVerifyService } from './youverify.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, VerificationDocument, KycVerification, Wallet]),
    EmailModule,
  ],
  controllers: [VerificationController],
  providers: [VerificationService, YouVerifyService],
  exports: [VerificationService],
})
export class VerificationModule {}
