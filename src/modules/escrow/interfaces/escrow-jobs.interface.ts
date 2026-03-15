export const ESCROW_QUEUE_NAME = 'escrow';

export enum EscrowJobName {
  CHECK_FULFILLMENT_EXPIRY = 'check-fulfillment-expiry',
  CHECK_AUTO_RELEASE = 'check-auto-release',
}

export interface CheckFulfillmentExpiryPayload {
  escrowId: string;
}

export interface CheckAutoReleasePayload {
  escrowId: string;
}
