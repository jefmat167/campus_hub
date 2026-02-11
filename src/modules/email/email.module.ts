import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { ResendService } from './resend.service';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([EmailVerification, User]),
  ],
  providers: [EmailService, ResendService],
  exports: [EmailService, ResendService],
})
export class EmailModule {}
