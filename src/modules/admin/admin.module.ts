import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Admin } from '../../database/entities/admin.entity';
import { AdminAuditLog } from '../../database/entities/admin-audit-log.entity';
import { AdminPermission } from '../../database/entities/admin-permission.entity';
import { User } from '../../database/entities/user.entity';
import { Wallet, WalletTransaction } from '../../database/entities/wallet.entity';
import { EscrowTransaction } from '../../database/entities/escrow.entity';
import { Listing } from '../../database/entities/listing.entity';
import { Post } from '../../database/entities/post.entity';
import { HousingListing } from '../../database/entities/housing.entity';
import { Report } from '../../database/entities/report.entity';
import { Warning } from '../../database/entities/warning.entity';
import { PlatformWallet, PlatformWalletTransaction } from '../../database/entities/platform-wallet.entity';
import { AdminJwtStrategy } from './strategies/admin-jwt.strategy';
import { AdminAuthService } from './admin-auth.service';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuditService } from './admin-audit.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminManagementService } from './admin-management.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Admin,
      AdminAuditLog,
      AdminPermission,
      User,
      Wallet,
      WalletTransaction,
      EscrowTransaction,
      Listing,
      Post,
      HousingListing,
      Report,
      Warning,
      PlatformWallet,
      PlatformWalletTransaction,
    ]),
    PassportModule.register({ defaultStrategy: 'admin-jwt' }),
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
  ],
  controllers: [AdminAuthController, AdminController],
  providers: [
    AdminJwtStrategy,
    AdminAuthService,
    AdminAuditService,
    AdminStatsService,
    AdminManagementService,
  ],
  exports: [AdminAuditService],
})
export class AdminModule {}
