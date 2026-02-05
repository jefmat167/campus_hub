import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { User } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { PasswordReset } from '../../database/entities/password-reset.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthProcessor } from './auth.processor';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { SmsModule } from '../sms/sms.module';
import { UniversitiesModule } from '../universities/universities.module';
import { EmailModule } from '../email/email.module';
import { AUTH_QUEUE_NAME } from './interfaces/auth-jobs.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Wallet, PasswordReset]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get('JWT_EXPIRES_IN', '15m'),
        },
      } as any),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: AUTH_QUEUE_NAME,
    }),
    SmsModule,
    UniversitiesModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthProcessor, JwtStrategy, JwtRefreshStrategy],
  exports: [AuthService, JwtStrategy],
})
export class AuthModule { }
