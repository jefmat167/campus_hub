import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { AdminAuditService } from './admin-audit.service';
import { AdminStatsService } from './admin-stats.service';
import { AdminManagementService } from './admin-management.service';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
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
  ],
  controllers: [AdminController],
  providers: [AdminAuditService, AdminStatsService, AdminManagementService],
  exports: [AdminAuditService],
})
export class AdminModule {}
