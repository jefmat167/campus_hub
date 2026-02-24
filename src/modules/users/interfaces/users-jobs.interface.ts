export const USERS_QUEUE_NAME = 'users';

export enum UsersJobName {
  PROCESS_SCHEDULED_DELETION = 'process-scheduled-deletion',
  SEND_DELETION_REMINDER = 'send-deletion-reminder',
}

export interface ProcessScheduledDeletionPayload {
  userId: string;
}

export interface SendDeletionReminderPayload {
  userId: string;
  email: string;
  fullName: string;
  scheduledDeletionAt: Date;
}
