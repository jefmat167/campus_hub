export const OFFERS_QUEUE_NAME = 'offers';

export enum OffersJobName {
  /** Listing offers (offers module): PENDING/COUNTERED past expiresAt → EXPIRED */
  EXPIRE_LISTING_OFFERS = 'expire-listing-offers',
  /** Buy-request offers (marketplace module): PENDING past expiresAt → EXPIRED */
  EXPIRE_BUY_REQUEST_OFFERS = 'expire-buy-request-offers',
}

/** Both sweeps run on this cron (every 15 minutes). */
export const OFFER_EXPIRY_CRON = '*/15 * * * *';
