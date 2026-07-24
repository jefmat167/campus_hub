export const ESCROW_QUEUE_NAME = 'escrow';

export enum EscrowJobName {
  CHECK_FULFILLMENT_EXPIRY = 'check-fulfillment-expiry',
  CHECK_AUTO_RELEASE = 'check-auto-release',
  SEND_FULFILLMENT_REMINDER = 'send-fulfillment-reminder',
}

export interface CheckFulfillmentExpiryPayload {
  escrowId: string;
}

export interface CheckAutoReleasePayload {
  escrowId: string;
}

export interface SendFulfillmentReminderPayload {
  escrowId: string;
  reminderNumber: number; // hours-after-creation offset this reminder is for
}
