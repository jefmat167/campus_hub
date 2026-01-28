import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { User } from '../../database/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([EmailVerification, User])],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
