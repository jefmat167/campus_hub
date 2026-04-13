import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Conversation, Message } from '../../database/entities/conversation.entity';
import { Listing } from '../../database/entities/listing.entity';
import { HousingListing } from '../../database/entities/housing.entity';
import { BuyRequest } from '../../database/entities/buy-request.entity';
import { RoommateProfile } from '../../database/entities/roommate.entity';
import { User } from '../../database/entities/user.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { HousingModule } from '../housing/housing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Listing, HousingListing, BuyRequest, RoommateProfile, User]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
    HousingModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}
