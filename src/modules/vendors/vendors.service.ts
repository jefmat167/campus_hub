import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { NotificationType } from '../../database/entities/notification.entity';
import { UniversitiesService } from '../universities/universities.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplyVendorDto } from './dto/apply-vendor.dto';
import { SubmitVendorApplicationDto } from './dto/submit-vendor-application.dto';
import { UpdateVendorProfileDto } from './dto/update-vendor-profile.dto';
import { SubmitCacDto } from './dto/submit-cac.dto';

/** Core profile fields shared by both onboarding doors. */
export interface VendorProfileSeed {
  businessName: string;
  description?: string | null;
  homeUniversityId: string;
  servedUniversityIds: string[];
}

const MAX_SERVED_UNIVERSITIES = 3;

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    @InjectRepository(VendorProfile)
    private profileRepo: Repository<VendorProfile>,
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    private dataSource: DataSource,
    private universitiesService: UniversitiesService,
    private notificationsService: NotificationsService,
  ) { }

  /**
   * Shared invariants for the served-universities selection (spec 03.2):
   * 1–3 distinct, active universities, and home ∈ served.
   */
  async validateUniversitySelection(
    homeUniversityId: string,
    servedUniversityIds: string[],
  ): Promise<void> {
    const unique = new Set(servedUniversityIds);
    if (unique.size !== servedUniversityIds.length) {
      throw new BadRequestException('Served universities must be distinct');
    }
    if (unique.size < 1 || unique.size > MAX_SERVED_UNIVERSITIES) {
      throw new BadRequestException(
        `A vendor serves between 1 and ${MAX_SERVED_UNIVERSITIES} universities`,
      );
    }
    if (!unique.has(homeUniversityId)) {
      throw new BadRequestException(
        'The home university must be one of the served universities',
      );
    }
    for (const universityId of unique) {
      try {
        // Throws NotFound for missing OR inactive universities.
        await this.universitiesService.findUniversityById(universityId);
      } catch {
        throw new BadRequestException(
          `University ${universityId} does not exist or is not active`,
        );
      }
    }
  }

  /**
   * Create the profile + served-university rows on an existing transaction.
   * Used by Door-2 registration (auth module, status DRAFT — the shopfront
   * photo arrives via the authed submit step) and by Door-1 apply (status
   * PENDING_REVIEW, photo included). Callers run validateUniversitySelection
   * first.
   */
  async createProfileWithManager(
    manager: EntityManager,
    userId: string,
    seed: VendorProfileSeed,
    initial: {
      status: VendorStatus;
      shopfrontPhotoUrl?: string | null;
      photoCapturedLive?: boolean;
    },
  ): Promise<VendorProfile> {
    const profile = manager.create(VendorProfile, {
      userId,
      businessName: seed.businessName,
      description: seed.description ?? null,
      homeUniversityId: seed.homeUniversityId,
      status: initial.status,
      shopfrontPhotoUrl: initial.shopfrontPhotoUrl ?? null,
      photoCapturedLive: initial.photoCapturedLive ?? false,
      submittedAt:
        initial.status === VendorStatus.PENDING_REVIEW ? new Date() : null,
    });
    const saved = await manager.save(profile);

    for (const universityId of new Set(seed.servedUniversityIds)) {
      await manager.save(
        manager.create(VendorUniversity, {
          vendorProfileId: saved.id,
          universityId,
        }),
      );
    }

    return saved;
  }

  /**
   * Door 1 — an existing Tier-2 student applies for the vendor role
   * (spec 03.1). Identity is already BVN/NIN-verified, so the application
   * carries the shopfront photo and goes straight to the review queue.
   */
  async applyAsStudent(
    userId: string,
    dto: ApplyVendorDto,
  ): Promise<Record<string, unknown>> {
    const existing = await this.profileRepo.findOne({ where: { userId } });
    if (existing) {
      throw new ConflictException(
        'This account already has a vendor profile',
      );
    }

    await this.validateUniversitySelection(
      dto.homeUniversityId,
      dto.servedUniversityIds,
    );

    const profile = await this.dataSource.transaction((manager) =>
      this.createProfileWithManager(
        manager,
        userId,
        {
          businessName: dto.businessName,
          description: dto.description,
          homeUniversityId: dto.homeUniversityId,
          servedUniversityIds: dto.servedUniversityIds,
        },
        {
          status: VendorStatus.PENDING_REVIEW,
          shopfrontPhotoUrl: dto.shopfrontPhotoUrl,
          photoCapturedLive: dto.photoCapturedLive,
        },
      ),
    );

    this.logger.log(`Vendor application submitted by user ${userId}`);
    return this.getMyVendor(userId, profile.id);
  }

  /** The caller's own vendor profile, any status. */
  async getMyVendor(
    userId: string,
    profileId?: string,
  ): Promise<Record<string, unknown>> {
    const profile = await this.profileRepo.findOne({
      where: profileId ? { id: profileId } : { userId },
      relations: [
        'homeUniversity',
        'servedUniversities',
        'servedUniversities.university',
      ],
    });
    if (!profile) {
      throw new NotFoundException('No vendor profile on this account');
    }
    return this.toVendorResponse(profile);
  }

  /**
   * Edit business fields and/or the served-universities selection. Suspended
   * profiles are frozen (an admin must reactivate first).
   */
  async updateMyProfile(
    userId: string,
    dto: UpdateVendorProfileDto,
  ): Promise<Record<string, unknown>> {
    const profile = await this.profileRepo.findOne({
      where: { userId },
      relations: ['servedUniversities'],
    });
    if (!profile) {
      throw new NotFoundException('No vendor profile on this account');
    }
    if (profile.status === VendorStatus.SUSPENDED) {
      throw new BadRequestException(
        'Suspended vendor profiles cannot be edited',
      );
    }

    const newHome = dto.homeUniversityId ?? profile.homeUniversityId;
    const newServed =
      dto.servedUniversityIds ??
      profile.servedUniversities.map((vu) => vu.universityId);

    if (dto.homeUniversityId !== undefined || dto.servedUniversityIds !== undefined) {
      await this.validateUniversitySelection(newHome, newServed);
    }

    await this.dataSource.transaction(async (manager) => {
      if (dto.businessName !== undefined) profile.businessName = dto.businessName;
      if (dto.description !== undefined) profile.description = dto.description;
      profile.homeUniversityId = newHome;
      await manager.save(profile);

      if (dto.servedUniversityIds !== undefined) {
        await manager.delete(VendorUniversity, { vendorProfileId: profile.id });
        for (const universityId of new Set(newServed)) {
          await manager.save(
            manager.create(VendorUniversity, {
              vendorProfileId: profile.id,
              universityId,
            }),
          );
        }
      }
    });

    return this.getMyVendor(userId);
  }

  /**
   * Complete/resubmit the application: DRAFT or REJECTED → PENDING_REVIEW
   * with the live-captured shopfront photo attached (spec 03.1 — required,
   * not recommended).
   */
  async submitForReview(
    userId: string,
    dto: SubmitVendorApplicationDto,
  ): Promise<Record<string, unknown>> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No vendor profile on this account');
    }
    if (
      profile.status !== VendorStatus.DRAFT &&
      profile.status !== VendorStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot submit for review from status '${profile.status}'`,
      );
    }

    profile.shopfrontPhotoUrl = dto.shopfrontPhotoUrl;
    profile.photoCapturedLive = dto.photoCapturedLive;
    profile.status = VendorStatus.PENDING_REVIEW;
    profile.submittedAt = new Date();
    profile.rejectionReason = null;
    await this.profileRepo.save(profile);

    this.logger.log(`Vendor profile ${profile.id} submitted for review`);
    return this.getMyVendor(userId);
  }

  /** Store CAC details for the optional Verified-badge upgrade (spec 03.1). */
  async submitCac(
    userId: string,
    dto: SubmitCacDto,
  ): Promise<Record<string, unknown>> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) {
      throw new NotFoundException('No vendor profile on this account');
    }

    profile.cacNumber = dto.cacNumber;
    profile.cacDocumentUrl = dto.cacDocumentUrl;
    // New/changed documents always need a fresh admin verification.
    profile.isVerified = false;
    await this.profileRepo.save(profile);

    return this.getMyVendor(userId);
  }

  // ─── Admin review queue (same workflow as the Tier-1 student queue) ───

  async listPending(
    page = 1,
    limit = 20,
  ): Promise<{ vendors: Record<string, unknown>[]; total: number }> {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = ((Number(page) || 1) - 1) * take;

    const [profiles, total] = await this.profileRepo.findAndCount({
      where: { status: VendorStatus.PENDING_REVIEW },
      relations: [
        'user',
        'homeUniversity',
        'servedUniversities',
        'servedUniversities.university',
      ],
      order: { submittedAt: 'ASC' },
      skip,
      take,
    });

    return {
      vendors: profiles.map((p) => this.toAdminResponse(p)),
      total,
    };
  }

  async getAdminDetail(profileId: string): Promise<Record<string, unknown>> {
    const profile = await this.findProfileWithRelations(profileId);
    return this.toAdminResponse(profile);
  }

  async approve(
    profileId: string,
    adminId: string,
  ): Promise<Record<string, unknown>> {
    const profile = await this.requireStatus(
      profileId,
      [VendorStatus.PENDING_REVIEW],
      'approve',
    );

    profile.status = VendorStatus.ACTIVE;
    profile.reviewedBy = adminId;
    profile.reviewedAt = new Date();
    profile.rejectionReason = null;
    await this.profileRepo.save(profile);

    await this.notifySafely(profile.userId, {
      type: NotificationType.VERIFICATION_APPROVED,
      title: 'Vendor application approved 🎉',
      body: `${profile.businessName} is now live on CampusHub. You can build your catalog and start selling.`,
      data: { vendorProfileId: profile.id },
    });

    this.logger.log(`Vendor ${profileId} approved by admin ${adminId}`);
    return this.getAdminDetail(profileId);
  }

  async reject(
    profileId: string,
    adminId: string,
    reason: string,
  ): Promise<Record<string, unknown>> {
    const profile = await this.requireStatus(
      profileId,
      [VendorStatus.PENDING_REVIEW],
      'reject',
    );

    profile.status = VendorStatus.REJECTED;
    profile.reviewedBy = adminId;
    profile.reviewedAt = new Date();
    profile.rejectionReason = reason;
    await this.profileRepo.save(profile);

    await this.notifySafely(profile.userId, {
      type: NotificationType.VERIFICATION_REJECTED,
      title: 'Vendor application rejected',
      body: `Reason: ${reason}. You can update your details and submit again.`,
      data: { vendorProfileId: profile.id },
    });

    this.logger.log(`Vendor ${profileId} rejected by admin ${adminId}`);
    return this.getAdminDetail(profileId);
  }

  async suspend(
    profileId: string,
    adminId: string,
    reason: string,
  ): Promise<Record<string, unknown>> {
    const profile = await this.requireStatus(
      profileId,
      [VendorStatus.ACTIVE],
      'suspend',
    );

    profile.status = VendorStatus.SUSPENDED;
    profile.suspensionReason = reason;
    await this.profileRepo.save(profile);

    await this.notifySafely(profile.userId, {
      type: NotificationType.WARNING_ISSUED,
      title: 'Vendor account suspended',
      body: `Your storefront has been suspended. Reason: ${reason}.`,
      data: { vendorProfileId: profile.id },
    });

    this.logger.log(`Vendor ${profileId} suspended by admin ${adminId}`);
    return this.getAdminDetail(profileId);
  }

  async reactivate(
    profileId: string,
    adminId: string,
  ): Promise<Record<string, unknown>> {
    const profile = await this.requireStatus(
      profileId,
      [VendorStatus.SUSPENDED],
      'reactivate',
    );

    profile.status = VendorStatus.ACTIVE;
    profile.suspensionReason = null;
    await this.profileRepo.save(profile);

    await this.notifySafely(profile.userId, {
      type: NotificationType.VERIFICATION_APPROVED,
      title: 'Vendor account reactivated',
      body: `${profile.businessName} is live again.`,
      data: { vendorProfileId: profile.id },
    });

    this.logger.log(`Vendor ${profileId} reactivated by admin ${adminId}`);
    return this.getAdminDetail(profileId);
  }

  async verifyCac(
    profileId: string,
    adminId: string,
  ): Promise<Record<string, unknown>> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Vendor profile not found');
    }
    if (!profile.cacNumber || !profile.cacDocumentUrl) {
      throw new BadRequestException(
        'This vendor has not submitted CAC details',
      );
    }

    profile.isVerified = true;
    await this.profileRepo.save(profile);

    await this.notifySafely(profile.userId, {
      type: NotificationType.VERIFICATION_APPROVED,
      title: 'CAC verified — you earned the Verified badge',
      body: `${profile.businessName} now shows as a Verified business.`,
      data: { vendorProfileId: profile.id },
    });

    this.logger.log(`Vendor ${profileId} CAC verified by admin ${adminId}`);
    return this.getAdminDetail(profileId);
  }

  // ─── internals ───

  private async findProfileWithRelations(
    profileId: string,
  ): Promise<VendorProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
      relations: [
        'user',
        'homeUniversity',
        'servedUniversities',
        'servedUniversities.university',
      ],
    });
    if (!profile) {
      throw new NotFoundException('Vendor profile not found');
    }
    return profile;
  }

  private async requireStatus(
    profileId: string,
    allowed: VendorStatus[],
    action: string,
  ): Promise<VendorProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Vendor profile not found');
    }
    if (!allowed.includes(profile.status)) {
      throw new BadRequestException(
        `Cannot ${action} a vendor in status '${profile.status}'`,
      );
    }
    return profile;
  }

  private async notifySafely(
    userId: string,
    params: {
      type: NotificationType;
      title: string;
      body: string;
      data?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      await this.notificationsService.createNotification({ userId, ...params });
    } catch (error) {
      this.logger.warn(
        `Failed to notify user ${userId} about vendor decision: ${error}`,
      );
    }
  }

  private toVendorResponse(profile: VendorProfile): Record<string, unknown> {
    return {
      id: profile.id,
      businessName: profile.businessName,
      description: profile.description,
      status: profile.status,
      homeUniversityId: profile.homeUniversityId,
      homeUniversity: profile.homeUniversity
        ? {
          id: profile.homeUniversity.id,
          name: profile.homeUniversity.name,
          code: profile.homeUniversity.code,
        }
        : undefined,
      servedUniversities: (profile.servedUniversities ?? []).map((vu) =>
        vu.university
          ? { id: vu.universityId, name: vu.university.name, code: vu.university.code }
          : { id: vu.universityId },
      ),
      shopfrontPhotoUrl: profile.shopfrontPhotoUrl,
      photoCapturedLive: profile.photoCapturedLive,
      cacNumber: profile.cacNumber,
      cacDocumentUrl: profile.cacDocumentUrl,
      isVerified: profile.isVerified,
      rejectionReason: profile.rejectionReason,
      suspensionReason: profile.suspensionReason,
      submittedAt: profile.submittedAt,
      createdAt: profile.createdAt,
    };
  }

  private toAdminResponse(profile: VendorProfile): Record<string, unknown> {
    return {
      ...this.toVendorResponse(profile),
      reviewedBy: profile.reviewedBy,
      reviewedAt: profile.reviewedAt,
      user: profile.user
        ? {
          id: profile.user.id,
          fullName: profile.user.fullName,
          email: profile.user.email,
          phone: profile.user.phone,
          accountType: profile.user.accountType,
          verificationTier: profile.user.verificationTier,
        }
        : undefined,
    };
  }
}
