import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailService } from './email.service';
import { EmailVerification } from '../../database/entities/email-verification.entity';
import { User } from '../../database/entities/user.entity';
import { MailerModule } from '@nestjs-modules/mailer';
import { EjsAdapter } from '@nestjs-modules/mailer/dist/adapters/ejs.adapter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailVerification, User]),
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.getOrThrow<string>('MAIL_HOST'),
          port: config.getOrThrow<number>('MAIL_PORT'),
          secure: config.getOrThrow<boolean>('MAIL_SECURE') ?? false,
          auth: {
            user: config.getOrThrow<string>('MAIL_USER'),
            pass: config.getOrThrow<string>('MAIL_PASS'),
          },
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new EjsAdapter(),
          options: {
            // strict: false
          },
        },
        defaults: {
          from: `"no_Reply" <${config.getOrThrow<string>('MAIL_FROM')}>`,
        },
      }),
    })
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule { }
