export const ESCROW_QUEUE_NAME = 'escrow';

export enum EscrowJobName {
  CHECK_FULFILLMENT_EXPIRY = 'check-fulfillment-expiry',
  CHECK_AUTO_RELEASE = 'check-auto-release',
  SEND_FULFILLMENT_REMINDER = 'send-fulfillment-reminder',
  // Vendor manual confirmation window (rev-2 03.5, Phase 5): auto-cancel with
  // a full refund + stock restore if the vendor never confirms.
  ORDER_CONFIRM_TIMEOUT = 'order-confirm-timeout',
  // Services (rev-2 03.6, Phase 6): no appointment agreed within 72h of the
  // order → auto-cancel with a full refund.
  SERVICE_AGREEMENT_TIMEOUT = 'service-agreement-timeout',
  // Services: not DELIVERED by appointment + 24h → auto-cancel, full refund.
  APPOINTMENT_BACKSTOP = 'appointment-backstop',
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

export interface OrderConfirmTimeoutPayload {
  escrowId: string;
}

export interface ServiceAgreementTimeoutPayload {
  escrowId: string;
}

export interface AppointmentBackstopPayload {
  escrowId: string;
}
