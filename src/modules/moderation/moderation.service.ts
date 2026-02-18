import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Report, ReportStatus, ReportAction, ReportType } from '../../database/entities/report.entity';
import { BanAppeal, BanAppealStatus } from '../../database/entities/ban-appeal.entity';
import { Warning, WarningReason } from '../../database/entities/warning.entity';
import { ModerationQueue, ModerationStatus, ModerationSource } from '../../database/entities/moderation-queue.entity';
import { User } from '../../database/entities/user.entity';
import { Listing, ListingStatus } from '../../database/entities/listing.entity';
import {
  CreateReportDto,
  ReviewReportDto,
  BanUserDto,
  CreateBanAppealDto,
  ReviewAppealDto,
  IssueWarningDto,
  ReviewQueueItemDto,
} from './dto';

@Injectable()
export class ModerationService {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(BanAppeal)
    private readonly banAppealRepository: Repository<BanAppeal>,
    @InjectRepository(Warning)
    private readonly warningRepository: Repository<Warning>,
    @InjectRepository(ModerationQueue)
    private readonly moderationQueueRepository: Repository<ModerationQueue>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Listing)
    private readonly listingRepository: Repository<Listing>,
  ) {}

  /**
   * Sanitize user object to remove sensitive data
   */
  private sanitizeUser(user: User): Record<string, any> {
    if (!user) return user;

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profilePhotoUrl: user.profilePhotoUrl,
      verificationTier: user.verificationTier,
      isBanned: user.isBanned,
      banReason: user.banReason,
      bannedAt: user.bannedAt,
      banExpiresAt: user.banExpiresAt,
    };
  }

  /**
   * Sanitize user relations in a report
   */
  private sanitizeReportUsers(report: Report): Report {
    if ((report as any).reporter) {
      (report as any).reporter = this.sanitizeUser((report as any).reporter);
    }
    if ((report as any).reportedUser) {
      (report as any).reportedUser = this.sanitizeUser((report as any).reportedUser);
    }
    if ((report as any).reviewedBy) {
      (report as any).reviewedBy = this.sanitizeUser((report as any).reviewedBy);
    }
    return report;
  }

  /**
   * Sanitize user relations in an array of reports
   */
  private sanitizeReportsUsers(reports: Report[]): Report[] {
    return reports.map((report) => this.sanitizeReportUsers(report));
  }

  /**
   * Sanitize user relations in a ban appeal
   */
  private sanitizeAppealUsers(appeal: BanAppeal): BanAppeal {
    if ((appeal as any).user) {
      (appeal as any).user = this.sanitizeUser((appeal as any).user);
    }
    if ((appeal as any).reviewedBy) {
      (appeal as any).reviewedBy = this.sanitizeUser((appeal as any).reviewedBy);
    }
    return appeal;
  }

  /**
   * Sanitize user relations in an array of appeals
   */
  private sanitizeAppealsUsers(appeals: BanAppeal[]): BanAppeal[] {
    return appeals.map((appeal) => this.sanitizeAppealUsers(appeal));
  }

  /**
   * Sanitize user relations in a moderation queue item
   */
  private sanitizeQueueItemUsers(item: ModerationQueue): ModerationQueue {
    if ((item as any).user) {
      (item as any).user = this.sanitizeUser((item as any).user);
    }
    if ((item as any).reviewedBy) {
      (item as any).reviewedBy = this.sanitizeUser((item as any).reviewedBy);
    }
    return item;
  }

  /**
   * Sanitize user relations in an array of queue items
   */
  private sanitizeQueueItemsUsers(items: ModerationQueue[]): ModerationQueue[] {
    return items.map((item) => this.sanitizeQueueItemUsers(item));
  }

  /**
   * Sanitize user in a warning
   */
  private sanitizeWarningUsers(warning: Warning): Warning {
    if ((warning as any).issuedBy) {
      (warning as any).issuedBy = this.sanitizeUser((warning as any).issuedBy);
    }
    return warning;
  }

  /**
   * Sanitize users in an array of warnings
   */
  private sanitizeWarningsUsers(warnings: Warning[]): Warning[] {
    return warnings.map((warning) => this.sanitizeWarningUsers(warning));
  }

  // ============ REPORTS ============

  async createReport(reporterId: string, dto: CreateReportDto): Promise<Report> {
    // Check for duplicate report from same user
    const existingReport = await this.reportRepository.findOne({
      where: {
        reporterId,
        type: dto.type,
        targetId: dto.targetId,
        status: In([ReportStatus.PENDING, ReportStatus.UNDER_REVIEW]),
      },
    });

    if (existingReport) {
      throw new BadRequestException('You have already reported this content');
    }

    // Get the reported user ID based on content type
    const reportedUserId = await this.getReportedUserId(dto.type, dto.targetId);

    // Prevent self-reports
    if (reportedUserId === reporterId) {
      throw new BadRequestException('You cannot report your own content');
    }

    // Check if this content has other reports - if so, increment count on existing
    const existingContentReport = await this.reportRepository.findOne({
      where: {
        type: dto.type,
        targetId: dto.targetId,
        status: In([ReportStatus.PENDING, ReportStatus.UNDER_REVIEW]),
      },
      order: { createdAt: 'ASC' },
    });

    if (existingContentReport) {
      // Increment report count and bump priority
      existingContentReport.reportCount += 1;
      existingContentReport.priority = Math.min(100, existingContentReport.priority + 10);
      await this.reportRepository.save(existingContentReport);
    }

    // Calculate initial priority based on reason
    const priority = this.calculateReportPriority(dto.reason);

    const report = this.reportRepository.create({
      reporterId,
      type: dto.type,
      targetId: dto.targetId,
      reportedUserId,
      reason: dto.reason,
      description: dto.description,
      evidence: dto.evidence,
      priority,
    });

    return this.reportRepository.save(report);
  }

  async getReports(
    page: number = 1,
    limit: number = 20,
    status?: ReportStatus,
    type?: ReportType,
  ): Promise<{ reports: Report[]; total: number }> {
    const query = this.reportRepository
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.reporter', 'reporter')
      .leftJoinAndSelect('report.reportedUser', 'reportedUser')
      .leftJoinAndSelect('report.reviewedBy', 'reviewedBy')
      .orderBy('report.priority', 'DESC')
      .addOrderBy('report.createdAt', 'ASC');

    if (status) {
      query.andWhere('report.status = :status', { status });
    }

    if (type) {
      query.andWhere('report.type = :type', { type });
    }

    const [reports, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { reports: this.sanitizeReportsUsers(reports), total };
  }

  async getReport(id: string): Promise<Report> {
    const report = await this.reportRepository.findOne({
      where: { id },
      relations: ['reporter', 'reportedUser', 'reviewedBy'],
    });

    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return this.sanitizeReportUsers(report);
  }

  async reviewReport(
    reportId: string,
    reviewerId: string,
    dto: ReviewReportDto,
  ): Promise<Report> {
    const report = await this.getReport(reportId);

    if (report.status === ReportStatus.ACTION_TAKEN || report.status === ReportStatus.DISMISSED) {
      throw new BadRequestException('This report has already been reviewed');
    }

    report.status = dto.action === ReportAction.NONE ? ReportStatus.DISMISSED : ReportStatus.ACTION_TAKEN;
    report.action = dto.action;
    report.reviewedById = reviewerId;
    report.reviewNotes = dto.reviewNotes || null;
    report.reviewedAt = new Date();

    // Take action based on the decision
    if (report.reportedUserId) {
      await this.executeReportAction(report, dto);
    }

    // Also resolve any other pending reports for the same content
    await this.reportRepository.update(
      {
        type: report.type,
        targetId: report.targetId,
        status: In([ReportStatus.PENDING, ReportStatus.UNDER_REVIEW]),
      },
      {
        status: report.status,
        action: report.action,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    );

    return this.reportRepository.save(report);
  }

  // ============ BANS ============

  async banUser(
    userId: string,
    adminId: string,
    dto: BanUserDto,
  ): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isBanned) {
      throw new BadRequestException('User is already banned');
    }

    user.isBanned = true;
    user.banReason = dto.reason;
    user.bannedAt = new Date();
    user.bannedBy = adminId;

    if (dto.permanent) {
      user.banExpiresAt = null; // Permanent ban
    } else if (dto.durationDays) {
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + dto.durationDays);
      user.banExpiresAt = expiryDate;
    } else {
      throw new BadRequestException('Must specify either permanent ban or duration');
    }

    // Handle device/phone bans by storing in a separate tracking mechanism
    // For now, we mark the user's device as banned
    if (dto.banDevice && user.deviceId) {
      await this.addBannedDevice(user.deviceId);
    }

    if (dto.banPhone) {
      await this.addBannedPhone(user.phone);
    }

    return this.userRepository.save(user);
  }

  async unbanUser(userId: string, adminId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isBanned) {
      throw new BadRequestException('User is not banned');
    }

    user.isBanned = false;
    user.banReason = null;
    user.banExpiresAt = null;
    user.bannedAt = null;
    user.bannedBy = null;

    return this.userRepository.save(user);
  }

  async checkBanStatus(userId: string): Promise<{
    isBanned: boolean;
    reason?: string;
    expiresAt?: Date | null;
    isPermanent?: boolean;
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if temporary ban has expired
    if (user.isBanned && user.banExpiresAt && user.banExpiresAt < new Date()) {
      // Auto-unban
      user.isBanned = false;
      user.banReason = null;
      user.banExpiresAt = null;
      user.bannedAt = null;
      user.bannedBy = null;
      await this.userRepository.save(user);

      return { isBanned: false };
    }

    return {
      isBanned: user.isBanned,
      reason: user.banReason || undefined,
      expiresAt: user.banExpiresAt,
      isPermanent: user.isBanned && !user.banExpiresAt,
    };
  }

  // ============ BAN APPEALS ============

  async createBanAppeal(userId: string, dto: CreateBanAppealDto): Promise<BanAppeal> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isBanned) {
      throw new BadRequestException('You are not banned');
    }

    // Check for existing pending appeal
    const existingAppeal = await this.banAppealRepository.findOne({
      where: {
        userId,
        status: In([BanAppealStatus.PENDING, BanAppealStatus.UNDER_REVIEW]),
      },
    });

    if (existingAppeal) {
      throw new BadRequestException('You already have a pending appeal');
    }

    const appeal = this.banAppealRepository.create({
      userId,
      reason: dto.reason,
      evidence: dto.evidence,
      originalBanReason: user.banReason,
      originalBanDate: user.bannedAt,
      originalBanExpiry: user.banExpiresAt,
    });

    return this.banAppealRepository.save(appeal);
  }

  async getBanAppeals(
    page: number = 1,
    limit: number = 20,
    status?: BanAppealStatus,
  ): Promise<{ appeals: BanAppeal[]; total: number }> {
    const query = this.banAppealRepository
      .createQueryBuilder('appeal')
      .leftJoinAndSelect('appeal.user', 'user')
      .leftJoinAndSelect('appeal.reviewedBy', 'reviewedBy')
      .orderBy('appeal.createdAt', 'ASC');

    if (status) {
      query.andWhere('appeal.status = :status', { status });
    }

    const [appeals, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { appeals: this.sanitizeAppealsUsers(appeals), total };
  }

  async reviewBanAppeal(
    appealId: string,
    reviewerId: string,
    dto: ReviewAppealDto,
  ): Promise<BanAppeal> {
    const appeal = await this.banAppealRepository.findOne({
      where: { id: appealId },
      relations: ['user'],
    });

    if (!appeal) {
      throw new NotFoundException('Appeal not found');
    }

    if (appeal.status === BanAppealStatus.APPROVED || appeal.status === BanAppealStatus.REJECTED) {
      throw new BadRequestException('This appeal has already been reviewed');
    }

    appeal.status = dto.status;
    appeal.reviewedById = reviewerId;
    appeal.reviewNotes = dto.reviewNotes || null;
    appeal.reviewedAt = new Date();

    // If approved, unban the user
    if (dto.status === BanAppealStatus.APPROVED) {
      await this.unbanUser(appeal.userId, reviewerId);
    }

    return this.banAppealRepository.save(appeal);
  }

  // ============ WARNINGS ============

  async issueWarning(
    userId: string,
    adminId: string,
    dto: IssueWarningDto,
  ): Promise<Warning> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const warning = this.warningRepository.create({
      userId,
      issuedById: adminId,
      reason: dto.reason,
      message: dto.message,
      reportId: dto.reportId,
      expiresAt: dto.expiryDays
        ? new Date(Date.now() + dto.expiryDays * 24 * 60 * 60 * 1000)
        : null,
    });

    return this.warningRepository.save(warning);
  }

  async getUserWarnings(userId: string): Promise<Warning[]> {
    const warnings = await this.warningRepository.find({
      where: { userId, isActive: true },
      relations: ['issuedBy'],
      order: { createdAt: 'DESC' },
    });

    return this.sanitizeWarningsUsers(warnings);
  }

  async acknowledgeWarning(warningId: string, userId: string): Promise<Warning> {
    const warning = await this.warningRepository.findOne({
      where: { id: warningId, userId },
    });

    if (!warning) {
      throw new NotFoundException('Warning not found');
    }

    if (warning.acknowledged) {
      throw new BadRequestException('Warning already acknowledged');
    }

    warning.acknowledged = true;
    warning.acknowledgedAt = new Date();

    return this.warningRepository.save(warning);
  }

  async getActiveWarningCount(userId: string): Promise<number> {
    return this.warningRepository.count({
      where: {
        userId,
        isActive: true,
      },
    });
  }

  // ============ MODERATION QUEUE ============

  async getModerationQueue(
    page: number = 1,
    limit: number = 20,
    status?: ModerationStatus,
  ): Promise<{ items: ModerationQueue[]; total: number }> {
    const query = this.moderationQueueRepository
      .createQueryBuilder('item')
      .leftJoinAndSelect('item.user', 'user')
      .leftJoinAndSelect('item.reviewedBy', 'reviewedBy')
      .orderBy('item.priority', 'DESC')
      .addOrderBy('item.createdAt', 'ASC');

    if (status) {
      query.andWhere('item.status = :status', { status });
    }

    const [items, total] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items: this.sanitizeQueueItemsUsers(items), total };
  }

  async getQueueItem(id: string): Promise<ModerationQueue> {
    const item = await this.moderationQueueRepository.findOne({
      where: { id },
      relations: ['user', 'reviewedBy'],
    });

    if (!item) {
      throw new NotFoundException('Queue item not found');
    }

    return this.sanitizeQueueItemUsers(item);
  }

  async reviewQueueItem(
    itemId: string,
    reviewerId: string,
    dto: ReviewQueueItemDto,
  ): Promise<ModerationQueue> {
    const item = await this.getQueueItem(itemId);

    if (item.status !== ModerationStatus.PENDING && item.status !== ModerationStatus.IN_REVIEW) {
      throw new BadRequestException('This item has already been reviewed');
    }

    item.status = dto.status;
    item.reviewedById = reviewerId;
    item.reviewNotes = dto.reviewNotes || null;
    item.actionTaken = dto.actionTaken || null;
    item.reviewedAt = new Date();

    // Handle content removal if rejected/removed
    if (dto.status === ModerationStatus.REMOVED) {
      await this.removeContent(item.contentType, item.contentId);
    }

    return this.moderationQueueRepository.save(item);
  }

  async addToModerationQueue(
    contentType: ModerationQueue['contentType'],
    contentId: string,
    userId: string,
    source: ModerationSource,
    options?: {
      category?: ModerationQueue['category'];
      aiScore?: number;
      aiDetails?: ModerationQueue['aiDetails'];
      flaggedKeywords?: string[];
      contentSnapshot?: string;
      priority?: number;
    },
  ): Promise<ModerationQueue> {
    // Check if already in queue
    const existing = await this.moderationQueueRepository.findOne({
      where: {
        contentType,
        contentId,
        status: In([ModerationStatus.PENDING, ModerationStatus.IN_REVIEW]),
      },
    });

    if (existing) {
      // Update priority if new source has higher priority
      if (options?.priority && options.priority > existing.priority) {
        existing.priority = options.priority;
        return this.moderationQueueRepository.save(existing);
      }
      return existing;
    }

    const queueItem = this.moderationQueueRepository.create({
      contentType,
      contentId,
      userId,
      source,
      category: options?.category,
      aiScore: options?.aiScore,
      aiDetails: options?.aiDetails,
      flaggedKeywords: options?.flaggedKeywords,
      contentSnapshot: options?.contentSnapshot,
      priority: options?.priority || 50,
    });

    return this.moderationQueueRepository.save(queueItem);
  }

  // ============ VERIFIED BADGE ============

  async checkVerifiedStatus(userId: string): Promise<{
    isVerified: boolean;
    criteria: {
      hasMinTransactions: boolean;
      hasMinRating: boolean;
      isAccountVerified: boolean;
    };
    progress: {
      transactions: number;
      requiredTransactions: number;
      rating: number;
      requiredRating: number;
    };
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const requiredTransactions = 10;
    const requiredRating = 4.5;

    const criteria = {
      hasMinTransactions: user.completedTransactions >= requiredTransactions,
      hasMinRating: Number(user.sellerRating) >= requiredRating,
      isAccountVerified: user.verificationTier === 'tier_2',
    };

    return {
      isVerified: criteria.hasMinTransactions && criteria.hasMinRating && criteria.isAccountVerified,
      criteria,
      progress: {
        transactions: user.completedTransactions,
        requiredTransactions,
        rating: Number(user.sellerRating),
        requiredRating,
      },
    };
  }

  // ============ HELPER METHODS ============

  private async getReportedUserId(type: ReportType, targetId: string): Promise<string | null> {
    switch (type) {
      case ReportType.USER:
        return targetId;

      case ReportType.LISTING:
      case ReportType.HOUSING:
        const listing = await this.listingRepository.findOne({
          where: { id: targetId },
          select: ['sellerId'],
        });
        return listing?.sellerId || null;

      // TODO: Inject Post and Comment repositories to fetch authorId
      case ReportType.POST:
      case ReportType.COMMENT:
      case ReportType.MESSAGE:
        return null;

      default:
        return null;
    }
  }

  private calculateReportPriority(reason: string): number {
    const highPriority = ['violence', 'self_harm', 'underage', 'illegal_content'];
    const mediumPriority = ['harassment', 'hate_speech', 'scam', 'fraud'];

    if (highPriority.includes(reason)) return 80;
    if (mediumPriority.includes(reason)) return 60;
    return 40;
  }

  private async executeReportAction(report: Report, dto: ReviewReportDto): Promise<void> {
    if (!report.reportedUserId) return;

    switch (dto.action) {
      case ReportAction.WARNING_ISSUED:
        await this.issueWarning(report.reportedUserId, report.reviewedById!, {
          reason: WarningReason.POLICY_VIOLATION,
          message: `Your content was reported for: ${report.reason}. Please follow community guidelines.`,
          reportId: report.id,
        });
        break;

      case ReportAction.CONTENT_REMOVED:
        await this.removeContent(report.type as any, report.targetId);
        break;

      case ReportAction.USER_BANNED_TEMP:
        await this.banUser(report.reportedUserId, report.reviewedById!, {
          reason: `Banned due to report: ${report.reason}`,
          durationDays: dto.banDurationDays || 7,
        });
        break;

      case ReportAction.USER_BANNED_PERM:
        await this.banUser(report.reportedUserId, report.reviewedById!, {
          reason: `Permanently banned due to report: ${report.reason}`,
          permanent: true,
        });
        break;
    }
  }

  private async removeContent(type: string, targetId: string): Promise<void> {
    // Soft delete or mark as removed based on content type
    switch (type) {
      case 'listing':
      case 'housing':
        await this.listingRepository.update(targetId, {
          status: ListingStatus.DELETED,
        });
        break;

      // TODO: Inject Post and Comment repositories to soft-delete content
      case 'post':
      case 'comment':
        break;
    }
  }

  private async addBannedDevice(deviceId: string): Promise<void> {
    // In a real implementation, you'd store banned device IDs in Redis or a separate table
    // For now, we'll just log it - you could create a banned_devices table
    console.log(`Device ${deviceId} added to ban list`);
  }

  private async addBannedPhone(phone: string): Promise<void> {
    // In a real implementation, you'd store banned phone numbers
    // For now, we'll just log it - you could create a banned_phones table
    console.log(`Phone ${phone} added to ban list`);
  }
}
