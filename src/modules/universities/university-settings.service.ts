import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import { UniversitySettings } from '../../database/entities/university-settings.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';
import { University } from '../../database/entities/university.entity';
import { UpdateUniversitySettingsDto } from './dto/update-university-settings.dto';
import { CreateDropPointDto } from './dto/create-drop-point.dto';
import { UpdateDropPointDto } from './dto/update-drop-point.dto';

/** Effective per-university money settings, every field resolved to a value. */
export interface ResolvedUniversitySettings {
  p2pFeePercent: number;
  vendorFeePercent: number;
  cancellationFeePercent: number;
  cancellationFeeEnabled: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // backstop; writes bust explicitly
const cacheKey = (universityId: string) => `university_settings:${universityId}`;

/**
 * Per-university money knobs (rev-2 spec 01.3 / 04.1): platform fees for both
 * markets and the post-ready cancellation fee, plus drop-point curation.
 *
 * Resolution rule: a university without a row — or with NULL columns — falls
 * back to the platform defaults (env-tunable). Fees are resolved by the
 * BUYER's university; resolve(null) returns pure defaults so callers never
 * need their own fallback branch.
 */
@Injectable()
export class UniversitySettingsService {
  private readonly logger = new Logger(UniversitySettingsService.name);
  private readonly defaults: ResolvedUniversitySettings;

  constructor(
    @InjectRepository(UniversitySettings)
    private settingsRepo: Repository<UniversitySettings>,
    @InjectRepository(DropPoint)
    private dropPointRepo: Repository<DropPoint>,
    @InjectRepository(University)
    private universityRepo: Repository<University>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    configService: ConfigService,
  ) {
    const platformFeeDefault = Number(
      configService.get('ESCROW_PLATFORM_FEE_PERCENT', 2.5),
    );
    this.defaults = Object.freeze({
      p2pFeePercent: platformFeeDefault,
      vendorFeePercent: Number(
        configService.get('VENDOR_PLATFORM_FEE_PERCENT', platformFeeDefault),
      ),
      cancellationFeePercent: Number(
        configService.get('ESCROW_CANCELLATION_FEE_PERCENT', 10),
      ),
      cancellationFeeEnabled: true,
    });
  }

  getDefaults(): ResolvedUniversitySettings {
    return this.defaults;
  }

  /**
   * Effective settings for a university. Cached (5-min TTL backstop, busted
   * on write). A null/undefined universityId resolves to pure defaults.
   */
  async resolve(
    universityId: string | null | undefined,
  ): Promise<ResolvedUniversitySettings> {
    if (!universityId) return this.defaults;

    const key = cacheKey(universityId);
    const cached = await this.cache.get<ResolvedUniversitySettings>(key);
    if (cached) return cached;

    const row = await this.settingsRepo.findOne({ where: { universityId } });
    // pg returns numeric columns as strings — normalise via Number().
    const resolved: ResolvedUniversitySettings = {
      p2pFeePercent:
        row?.p2pFeePercent != null
          ? Number(row.p2pFeePercent)
          : this.defaults.p2pFeePercent,
      vendorFeePercent:
        row?.vendorFeePercent != null
          ? Number(row.vendorFeePercent)
          : this.defaults.vendorFeePercent,
      cancellationFeePercent:
        row?.cancellationFeePercent != null
          ? Number(row.cancellationFeePercent)
          : this.defaults.cancellationFeePercent,
      cancellationFeeEnabled:
        row?.cancellationFeeEnabled ?? this.defaults.cancellationFeeEnabled,
    };

    await this.cache.set(key, resolved, CACHE_TTL_MS);
    return resolved;
  }

  /** Raw override row + effective values + defaults, for the admin surface. */
  async getForAdmin(universityId: string): Promise<{
    defaults: ResolvedUniversitySettings;
    overrides: UniversitySettings | null;
    effective: ResolvedUniversitySettings;
  }> {
    await this.assertUniversityExists(universityId);
    const overrides = await this.settingsRepo.findOne({
      where: { universityId },
    });
    const effective = await this.resolve(universityId);
    return { defaults: this.defaults, overrides, effective };
  }

  /**
   * Upsert the override row. Only keys present in the DTO are touched;
   * an explicit null clears that override back to the platform default.
   */
  async updateSettings(
    universityId: string,
    dto: UpdateUniversitySettingsDto,
  ): Promise<UniversitySettings> {
    await this.assertUniversityExists(universityId);

    let row = await this.settingsRepo.findOne({ where: { universityId } });
    if (!row) {
      row = this.settingsRepo.create({ universityId });
    }

    if (dto.p2pFeePercent !== undefined) {
      row.p2pFeePercent = dto.p2pFeePercent;
    }
    if (dto.vendorFeePercent !== undefined) {
      row.vendorFeePercent = dto.vendorFeePercent;
    }
    if (dto.cancellationFeePercent !== undefined) {
      row.cancellationFeePercent = dto.cancellationFeePercent;
    }
    if (dto.cancellationFeeEnabled !== undefined) {
      row.cancellationFeeEnabled = dto.cancellationFeeEnabled;
    }

    const saved = await this.settingsRepo.save(row);
    await this.cache.del(cacheKey(universityId));
    this.logger.log(
      `University settings updated for ${universityId}: ${JSON.stringify(dto)}`,
    );
    return saved;
  }

  // ─── Drop points ────────────────────────────────────────────────

  async listDropPoints(
    universityId: string,
    includeInactive = false,
  ): Promise<DropPoint[]> {
    await this.assertUniversityExists(universityId);
    return this.dropPointRepo.find({
      where: includeInactive
        ? { universityId }
        : { universityId, isActive: true },
      order: { name: 'ASC' },
    });
  }

  async createDropPoint(
    universityId: string,
    dto: CreateDropPointDto,
  ): Promise<DropPoint> {
    await this.assertUniversityExists(universityId);
    const dropPoint = this.dropPointRepo.create({
      universityId,
      name: dto.name,
      directions: dto.directions ?? null,
    });
    return this.dropPointRepo.save(dropPoint);
  }

  async updateDropPoint(
    dropPointId: string,
    dto: UpdateDropPointDto,
  ): Promise<DropPoint> {
    const dropPoint = await this.dropPointRepo.findOne({
      where: { id: dropPointId },
    });
    if (!dropPoint) {
      throw new NotFoundException('Drop point not found');
    }
    if (dto.name !== undefined) dropPoint.name = dto.name;
    if (dto.directions !== undefined) dropPoint.directions = dto.directions;
    if (dto.isActive !== undefined) dropPoint.isActive = dto.isActive;
    return this.dropPointRepo.save(dropPoint);
  }

  private async assertUniversityExists(universityId: string): Promise<void> {
    const university = await this.universityRepo.findOne({
      where: { id: universityId },
      select: ['id'],
    });
    if (!university) {
      throw new NotFoundException('University not found');
    }
  }
}
