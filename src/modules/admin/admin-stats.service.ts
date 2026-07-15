import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { WalletTransaction, WalletTransactionType } from '../../database/entities/wallet.entity';
import { EscrowTransaction, EscrowStatus } from '../../database/entities/escrow.entity';
import { Listing } from '../../database/entities/listing.entity';
import { Post } from '../../database/entities/post.entity';
import { HousingListing } from '../../database/entities/housing.entity';
import { Report, ReportStatus } from '../../database/entities/report.entity';
import { Warning } from '../../database/entities/warning.entity';
import { PlatformWallet, PlatformWalletTransaction } from '../../database/entities/platform-wallet.entity';

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(WalletTransaction) private walletTxRepo: Repository<WalletTransaction>,
    @InjectRepository(EscrowTransaction) private escrowRepo: Repository<EscrowTransaction>,
    @InjectRepository(Listing) private listingRepo: Repository<Listing>,
    @InjectRepository(Post) private postRepo: Repository<Post>,
    @InjectRepository(HousingListing) private housingRepo: Repository<HousingListing>,
    @InjectRepository(Report) private reportRepo: Repository<Report>,
    @InjectRepository(Warning) private warningRepo: Repository<Warning>,
    @InjectRepository(PlatformWallet) private platformWalletRepo: Repository<PlatformWallet>,
    @InjectRepository(PlatformWalletTransaction) private platformTxRepo: Repository<PlatformWalletTransaction>,
  ) {}

  async getUserStats(): Promise<Record<string, any>> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newToday,
      newThisWeek,
      newThisMonth,
      activeLast24h,
      activeLast7d,
      tierBreakdown,
    ] = await Promise.all([
      this.userRepo.count({ where: { isDeleted: false } }),
      this.userRepo.createQueryBuilder('u').where('u.isDeleted = false').andWhere('u.createdAt >= :today', { today }).getCount(),
      this.userRepo.createQueryBuilder('u').where('u.isDeleted = false').andWhere('u.createdAt >= :weekAgo', { weekAgo }).getCount(),
      this.userRepo.createQueryBuilder('u').where('u.isDeleted = false').andWhere('u.createdAt >= :monthAgo', { monthAgo }).getCount(),
      this.userRepo.createQueryBuilder('u').where('u.isDeleted = false').andWhere('u.lastActiveAt >= :dayAgo', { dayAgo }).getCount(),
      this.userRepo.createQueryBuilder('u').where('u.isDeleted = false').andWhere('u.lastActiveAt >= :weekAgo', { weekAgo }).getCount(),
      this.userRepo.createQueryBuilder('u')
        .select('u.verificationTier', 'tier')
        .addSelect('COUNT(*)', 'count')
        .where('u.isDeleted = false')
        .groupBy('u.verificationTier')
        .getRawMany(),
    ]);

    return {
      totalUsers,
      newToday,
      newThisWeek,
      newThisMonth,
      activeLast24h,
      activeLast7d,
      tierBreakdown: tierBreakdown.reduce((acc: Record<string, number>, r: any) => {
        acc[r.tier] = Number(r.count);
        return acc;
      }, {}),
    };
  }

  async getFinancialStats(): Promise<Record<string, any>> {
    const [
      escrowVolume,
      platformFees,
      walletAggregates,
      withdrawalsByStatus,
    ] = await Promise.all([
      this.escrowRepo.createQueryBuilder('e')
        .select('SUM(e.amount)', 'total')
        .where('e.status IN (:...statuses)', {
          statuses: [EscrowStatus.COMPLETED, EscrowStatus.DELIVERED],
        })
        .getRawOne(),
      this.platformTxRepo.createQueryBuilder('pt')
        .select('SUM(pt.amount)', 'total')
        .getRawOne(),
      this.walletRepo.createQueryBuilder('w')
        .select('SUM(w.balance)', 'totalBalance')
        .addSelect('SUM(w.lockedBalance)', 'totalLocked')
        .getRawOne(),
      this.walletTxRepo.createQueryBuilder('wt')
        .select('wt.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .addSelect('SUM(wt.amount)', 'total')
        .where('wt.type = :type', { type: WalletTransactionType.WITHDRAWAL })
        .groupBy('wt.status')
        .getRawMany(),
    ]);

    return {
      totalEscrowVolume: Number(escrowVolume?.total) || 0,
      totalPlatformFees: Number(platformFees?.total) || 0,
      totalWalletBalance: Number(walletAggregates?.totalBalance) || 0,
      totalLockedBalance: Number(walletAggregates?.totalLocked) || 0,
      withdrawals: withdrawalsByStatus.reduce((acc: Record<string, any>, r: any) => {
        acc[r.status] = { count: Number(r.count), total: Number(r.total) || 0 };
        return acc;
      }, {}),
    };
  }

  async getContentStats(): Promise<Record<string, any>> {
    const [listingsByStatus, totalPosts, housingByStatus, reportResolution] =
      await Promise.all([
        this.listingRepo.createQueryBuilder('l')
          .select('l.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('l.status')
          .getRawMany(),
        this.postRepo.count({ where: { isDeleted: false } }),
        this.housingRepo.createQueryBuilder('h')
          .select('h.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('h.status')
          .getRawMany(),
        this.reportRepo.createQueryBuilder('r')
          .select('r.status', 'status')
          .addSelect('COUNT(*)', 'count')
          .groupBy('r.status')
          .getRawMany(),
      ]);

    const reportCounts = reportResolution.reduce((acc: Record<string, number>, r: any) => {
      acc[r.status] = Number(r.count);
      return acc;
    }, {});
    const totalReports = Object.values(reportCounts).reduce<number>((sum, c) => sum + (c as number), 0);
    const resolvedReports = (reportCounts[ReportStatus.ACTION_TAKEN] || 0) + (reportCounts[ReportStatus.DISMISSED] || 0);

    return {
      listings: listingsByStatus.reduce((acc: Record<string, number>, r: any) => {
        acc[r.status] = Number(r.count);
        return acc;
      }, {}),
      totalPosts,
      housing: housingByStatus.reduce((acc: Record<string, number>, r: any) => {
        acc[r.status] = Number(r.count);
        return acc;
      }, {}),
      reports: reportCounts,
      reportResolutionRate: totalReports > 0 ? Number(((resolvedReports / totalReports) * 100).toFixed(1)) : 0,
    };
  }

  async getModerationStats(): Promise<Record<string, any>> {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [pendingReports, activeBans, warningsThisMonth] = await Promise.all([
      this.reportRepo.count({
        where: [
          { status: ReportStatus.PENDING },
          { status: ReportStatus.UNDER_REVIEW },
        ],
      }),
      this.userRepo.createQueryBuilder('u')
        .where('u.isBanned = true')
        .andWhere('(u.banExpiresAt IS NULL OR u.banExpiresAt > :now)', { now })
        .getCount(),
      this.warningRepo.createQueryBuilder('w')
        .where('w.createdAt >= :monthAgo', { monthAgo })
        .getCount(),
    ]);

    return {
      pendingReports,
      activeBans,
      warningsThisMonth,
    };
  }

  async getDashboard(): Promise<Record<string, any>> {
    const [users, financial, content, moderation] = await Promise.all([
      this.getUserStats(),
      this.getFinancialStats(),
      this.getContentStats(),
      this.getModerationStats(),
    ]);

    return { users, financial, content, moderation };
  }
}
