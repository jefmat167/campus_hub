import { Injectable } from '@nestjs/common';

/** Injection token — swap the implementation to add real calendars later. */
export const AVAILABILITY_VALIDATOR = 'AVAILABILITY_VALIDATOR';

export interface AvailabilityContext {
  listingId: string | null;
  proposedTime: Date;
}

/**
 * The calendar seam (rev-2 spec 05, open item "calendar/availability"): every
 * time a service appointment is proposed or accepted, the time passes through
 * this hook. v1 always allows — the accept/reject/counter negotiation is the
 * double-booking defence (spec 03.6, "open gap"). A real implementation
 * (vendor_availability tables + conflict checks) replaces the provider only;
 * proposals and orders don't change.
 */
export interface AvailabilityValidator {
  /** Throw a BadRequestException to veto the time; return to allow it. */
  assertAvailable(ctx: AvailabilityContext): Promise<void>;
}

@Injectable()
export class AlwaysAvailableValidator implements AvailabilityValidator {
  async assertAvailable(_ctx: AvailabilityContext): Promise<void> {
    // v1: no calendar infrastructure — every proposed time is allowed.
  }
}
