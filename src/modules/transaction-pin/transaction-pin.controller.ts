import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../../database/entities/user.entity';
import { TransactionPinService } from './transaction-pin.service';
import {
  SetTransactionPinDto,
  ChangeTransactionPinDto,
  ResetTransactionPinDto,
} from './dto/transaction-pin.dto';

@ApiTags('Transaction PIN')
@Controller('transaction-pin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionPinController {
  constructor(private readonly pinService: TransactionPinService) {}

  @Get('status')
  @ApiOperation({ summary: 'Whether the caller has a transaction PIN set / locked' })
  async status(@CurrentUser() user: User) {
    return { success: true, data: await this.pinService.getStatus(user.id) };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 600000 } }) // 5 per 10 minutes
  @ApiOperation({ summary: 'Set the transaction PIN (first time; requires password)' })
  async set(@CurrentUser() user: User, @Body() dto: SetTransactionPinDto) {
    await this.pinService.setPin(user.id, dto.password, dto.pin);
    return { success: true, message: 'Transaction PIN set' };
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 600000 } })
  @ApiOperation({ summary: 'Change the transaction PIN (requires current PIN)' })
  async change(@CurrentUser() user: User, @Body() dto: ChangeTransactionPinDto) {
    await this.pinService.changePin(user.id, dto.currentPin, dto.newPin);
    return { success: true, message: 'Transaction PIN changed' };
  }

  @Post('reset/request-otp')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 600000 } }) // 3 per 10 minutes
  @ApiOperation({ summary: 'Send an OTP to reset a forgotten transaction PIN' })
  async requestReset(@CurrentUser() user: User) {
    return { success: true, data: await this.pinService.requestReset(user.id) };
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 5, ttl: 600000 } })
  @ApiOperation({ summary: 'Reset the transaction PIN with an OTP' })
  async reset(@CurrentUser() user: User, @Body() dto: ResetTransactionPinDto) {
    await this.pinService.resetPin(user.id, dto.otp, dto.newPin);
    return { success: true, message: 'Transaction PIN reset' };
  }
}
