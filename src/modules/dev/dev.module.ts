import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DevController } from './dev.controller';
import { User } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';

/**
 * Development module for testing verification flows.
 * Provides endpoints to quickly set user tiers and bypass verification.
 * All endpoints are disabled in production.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Wallet]),
    ConfigModule,
  ],
  controllers: [DevController],
})
export class DevModule {}
