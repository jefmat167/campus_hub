import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * What kind of order the numbers are being resolved for. v1 ignores the
 * context entirely — it exists so per-category overrides (rev-2 spec 05,
 * "per-category timing") can become a table lookup later without touching
 * any call site.
 */
export interface TimingPolicyContext {
  market?: 'p2p' | 'vendor';
  itemType?: 'p2p_listing' | 'vendor_goods' | 'vendor_service';
  category?: string;
}

export interface TimingPolicy {
  /** Vendor manual-confirmation window before auto-cancel (spec 03.5). */
  confirmationHours: number;
  /** Order-placed → DELIVERED deadline for goods (spec 01.2). */
  fulfillmentHours: number;
  /** Post-delivery dispute window (spec 01.2). */
  disputeWindowMinutes: number;
  /** Services: window to agree an appointment time (spec 03.6). */
  agreementHours: number;
  /** Services: how far out an appointment may sit, in days (spec 03.6). */
  appointmentHorizonDays: number;
  /** Services: vendor no-show grace before the buyer can claim a refund (spec 03.6). */
  noShowGraceMinutes: number;
  /** Services: auto-refund backstop past the appointment (spec 03.6). */
  appointmentBackstopHours: number;
  /** Services: how long a single time proposal stays open (spec 03.6 — "same 48h as offers"). */
  proposalExpiryHours: number;
  /** P2P: how long an accepted offer's price stays locked in the cart (spec 01.6). */
  offerLockHours: number;
}

/**
 * Single source for every marketplace timing number. Nothing outside this
 * service reads the timing env vars, and no caller hardcodes 72/24/14/30 —
 * so per-category policies (a table + admin CRUD, spec 05) slot in behind
 * resolve() with zero call-site changes.
 */
@Injectable()
export class TimingPolicyService {
  private readonly defaults: TimingPolicy;

  constructor(configService: ConfigService) {
    this.defaults = Object.freeze({
      confirmationHours: Number(
        configService.get('ORDER_CONFIRMATION_HOURS', 24),
      ),
      fulfillmentHours: Number(
        configService.get('ESCROW_FULFILLMENT_HOURS', 72),
      ),
      disputeWindowMinutes: Number(
        configService.get('ESCROW_DISPUTE_WINDOW_MINUTES', 1440),
      ),
      agreementHours: Number(configService.get('SERVICE_AGREEMENT_HOURS', 72)),
      appointmentHorizonDays: Number(
        configService.get('SERVICE_APPOINTMENT_HORIZON_DAYS', 14),
      ),
      noShowGraceMinutes: Number(
        configService.get('SERVICE_NO_SHOW_GRACE_MINUTES', 30),
      ),
      appointmentBackstopHours: Number(
        configService.get('SERVICE_APPOINTMENT_BACKSTOP_HOURS', 24),
      ),
      proposalExpiryHours: Number(
        configService.get('SERVICE_PROPOSAL_EXPIRY_HOURS', 48),
      ),
      offerLockHours: Number(configService.get('OFFER_LOCK_HOURS', 24)),
    });
  }

  resolve(_ctx?: TimingPolicyContext): TimingPolicy {
    // v1: uniform env-backed defaults for every market/category.
    return this.defaults;
  }
}
