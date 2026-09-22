import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { VendorUniversity } from '../../database/entities/vendor-university.entity';
import { VendorDeliveryPoint } from '../../database/entities/vendor-delivery-point.entity';
import { DropPoint } from '../../database/entities/drop-point.entity';
import {
  VendorProfile,
  VendorStatus,
} from '../../database/entities/vendor-profile.entity';
import { ReplaceVendorDeliveryDto } from './dto/vendor-delivery.dto';

export const MAX_DELIVERY_POINTS_PER_CAMPUS = 3;

/** One admin drop point the vendor delivers to, as buyers/checkout see it. */
export interface ResolvedDropPoint {
  id: string;
  name: string;
  directions: string | null;
  fee: number; // naira
}

/**
 * The vendor's delivery preset for ONE campus, resolved for a buyer there.
 * `dropPoints` holds active points only; fees are naira. "Goods deliverable"
 * = doorDeliveryFee !== null || dropPoints.length > 0; "service travels" =
 * serviceTravelFee !== null.
 */
export interface CampusDeliveryPreset {
  vendorProfileId: string;
  businessName: string;
  universityId: string;
  isHome: boolean;
  doorDeliveryFee: number | null;
  serviceTravelFee: number | null;
  dropPoints: ResolvedDropPoint[];
}

/**
 * Vendor-level delivery presets (2026-09-21 amendment to spec 03.2). The
 * `vendor_universities` row is the preset for that campus; listings inherit
 * it and only opt out via `pickupOnly`. This service is the single reader
 * (checkout, listing detail, the buyer endpoint) and the single writer (the
 * vendor's settings screen).
 */
@Injectable()
export class VendorDeliveryService {
  constructor(
    @InjectRepository(VendorUniversity)
    private vendorUniversityRepo: Repository<VendorUniversity>,
    @InjectRepository(VendorDeliveryPoint)
    private deliveryPointRepo: Repository<VendorDeliveryPoint>,
    @InjectRepository(DropPoint)
    private dropPointRepo: Repository<DropPoint>,
    private dataSource: DataSource,
  ) {}

  /**
   * The preset a buyer at `universityId` gets from this vendor, or null when
   * the vendor doesn't serve that campus (or isn't ACTIVE, unless the caller
   * opts out of that check). One query.
   */
  async resolveForCampus(
    vendorProfileId: string,
    universityId: string,
    options: { requireActive?: boolean } = {},
  ): Promise<CampusDeliveryPreset | null> {
    const row = await this.vendorUniversityRepo.findOne({
      where: { vendorProfileId, universityId },
      relations: ['vendorProfile', 'deliveryPoints', 'deliveryPoints.dropPoint'],
    });
    if (!row || !row.vendorProfile) return null;
    if (
      (options.requireActive ?? true) &&
      row.vendorProfile.status !== VendorStatus.ACTIVE
    ) {
      return null;
    }
    return this.toPreset(row, row.vendorProfile);
  }

  /** The vendor's own settings view: every served campus + what admins offer there. */
  async getOwn(profile: VendorProfile): Promise<Record<string, unknown>> {
    const rows = await this.vendorUniversityRepo.find({
      where: { vendorProfileId: profile.id },
      relations: ['university', 'deliveryPoints', 'deliveryPoints.dropPoint'],
      order: { createdAt: 'ASC' },
    });
    const campusIds = rows.map((row) => row.universityId);
    const available = campusIds.length
      ? await this.dropPointRepo.find({
          where: { universityId: In(campusIds), isActive: true },
          order: { name: 'ASC' },
        })
      : [];
    const availableByCampus = new Map<string, DropPoint[]>();
    for (const point of available) {
      const list = availableByCampus.get(point.universityId) ?? [];
      list.push(point);
      availableByCampus.set(point.universityId, list);
    }

    return {
      universities: rows.map((row) => {
        const isHome = row.universityId === profile.homeUniversityId;
        return {
          universityId: row.universityId,
          name: row.university?.name ?? null,
          code: row.university?.code ?? null,
          isHome,
          doorDeliveryFee:
            isHome && row.doorDeliveryFee !== null
              ? Number(row.doorDeliveryFee)
              : null,
          serviceTravelFee:
            row.serviceTravelFee !== null ? Number(row.serviceTravelFee) : null,
          dropPoints: (row.deliveryPoints ?? []).map((point) => ({
            dropPointId: point.dropPointId,
            name: point.dropPoint?.name ?? null,
            directions: point.dropPoint?.directions ?? null,
            fee: Number(point.fee),
            // false = retired by admins since the vendor picked it; the web
            // form drops it and asks the vendor to save.
            isActive: point.dropPoint?.isActive ?? false,
          })),
          availableDropPoints: (availableByCampus.get(row.universityId) ?? []).map(
            (point) => ({
              id: point.id,
              name: point.name,
              directions: point.directions,
            }),
          ),
        };
      }),
    };
  }

  /**
   * Full replacement of the preset. A served campus missing from the body
   * resets to pickup-only. Suspended profiles are frozen; DRAFT/PENDING may
   * configure delivery ahead of approval.
   */
  async replace(
    profile: VendorProfile,
    dto: ReplaceVendorDeliveryDto,
  ): Promise<Record<string, unknown>> {
    if (profile.status === VendorStatus.SUSPENDED) {
      throw new BadRequestException(
        'Suspended vendor profiles cannot be edited',
      );
    }

    const rows = await this.vendorUniversityRepo.find({
      where: { vendorProfileId: profile.id },
      relations: ['university'],
    });
    const served = new Map(rows.map((row) => [row.universityId, row]));

    const seenCampus = new Set<string>();
    for (const campus of dto.universities) {
      if (seenCampus.has(campus.universityId)) {
        throw new BadRequestException(
          'Duplicate university in the delivery settings',
        );
      }
      seenCampus.add(campus.universityId);

      const row = served.get(campus.universityId);
      if (!row) {
        throw new BadRequestException(
          'Delivery can only be configured for universities this vendor serves',
        );
      }
      const isHome = campus.universityId === profile.homeUniversityId;
      if (!isHome && campus.doorDeliveryFee != null) {
        throw new BadRequestException(
          `Door delivery is only available on your home campus — ${row.university?.name ?? 'that university'} can only be served through drop points`,
        );
      }
      const pointIds = campus.dropPoints.map((point) => point.dropPointId);
      if (new Set(pointIds).size !== pointIds.length) {
        throw new BadRequestException(
          'Duplicate drop point in the delivery settings',
        );
      }
      if (pointIds.length > MAX_DELIVERY_POINTS_PER_CAMPUS) {
        throw new BadRequestException(
          `At most ${MAX_DELIVERY_POINTS_PER_CAMPUS} drop points per university`,
        );
      }
    }

    // Every chosen point must be an ACTIVE admin drop point AT that campus.
    const allPointIds = dto.universities.flatMap((campus) =>
      campus.dropPoints.map((point) => point.dropPointId),
    );
    const points = allPointIds.length
      ? await this.dropPointRepo.find({ where: { id: In(allPointIds) } })
      : [];
    const pointsById = new Map(points.map((point) => [point.id, point]));
    for (const campus of dto.universities) {
      for (const chosen of campus.dropPoints) {
        const point = pointsById.get(chosen.dropPointId);
        if (!point || !point.isActive) {
          throw new BadRequestException(
            `Drop point ${chosen.dropPointId} is not an active drop point`,
          );
        }
        if (point.universityId !== campus.universityId) {
          throw new BadRequestException(
            `Drop point "${point.name}" is not at that university`,
          );
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      for (const row of rows) {
        const config = dto.universities.find(
          (campus) => campus.universityId === row.universityId,
        );
        const isHome = row.universityId === profile.homeUniversityId;
        row.doorDeliveryFee =
          config && isHome ? config.doorDeliveryFee ?? null : null;
        row.serviceTravelFee = config ? config.serviceTravelFee ?? null : null;
        await manager.save(row);

        await manager.delete(VendorDeliveryPoint, { vendorUniversityId: row.id });
        for (const chosen of config?.dropPoints ?? []) {
          await manager.save(
            manager.create(VendorDeliveryPoint, {
              vendorUniversityId: row.id,
              dropPointId: chosen.dropPointId,
              fee: chosen.fee,
            }),
          );
        }
      }
    });

    return this.getOwn(profile);
  }

  // ─── internals ───

  private toPreset(
    row: VendorUniversity,
    profile: VendorProfile,
  ): CampusDeliveryPreset {
    const isHome = profile.homeUniversityId === row.universityId;
    return {
      vendorProfileId: profile.id,
      businessName: profile.businessName,
      universityId: row.universityId,
      isHome,
      doorDeliveryFee:
        isHome && row.doorDeliveryFee !== null ? Number(row.doorDeliveryFee) : null,
      serviceTravelFee:
        row.serviceTravelFee !== null ? Number(row.serviceTravelFee) : null,
      dropPoints: (row.deliveryPoints ?? [])
        .filter((point) => point.dropPoint && point.dropPoint.isActive)
        .map((point) => ({
          id: point.dropPointId,
          name: point.dropPoint.name,
          directions: point.dropPoint.directions,
          fee: Number(point.fee),
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
