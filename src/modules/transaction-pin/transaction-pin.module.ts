import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities/user.entity';
import { SmsModule } from '../sms/sms.module';
import { TransactionPinService } from './transaction-pin.service';
import { TransactionPinController } from './transaction-pin.controller';
import { TransactionPinGuard } from './transaction-pin.guard';

/**
 * Owns the transaction-PIN credential: management endpoints + the reusable
 * verification service and guard. Imported by the money-out modules
 * (escrow, payment, marketplace) so they can enforce the PIN.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), SmsModule],
  controllers: [TransactionPinController],
  providers: [TransactionPinService, TransactionPinGuard],
  exports: [TransactionPinService, TransactionPinGuard],
})
export class TransactionPinModule {}
