import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';

export enum NotificationType {
  // Messages
  NEW_MESSAGE = 'new_message',

  // Offers
  OFFER_RECEIVED = 'offer_received',
  OFFER_ACCEPTED = 'offer_accepted',
  OFFER_REJECTED = 'offer_rejected',
  OFFER_COUNTERED = 'offer_countered',
  OFFER_EXPIRED = 'offer_expired',

  // Escrow / Orders
  ESCROW_INITIATED = 'escrow_initiated',
  SELLER_READY = 'seller_ready', // Seller clicked "I'm Ready"
  DELIVERY_CODE_SENT = 'delivery_code_sent', // Code sent to buyer
  DELIVERY_CONFIRMED = 'delivery_confirmed', // Code verified
  ORDER_AUTO_COMPLETED = 'order_auto_completed', // 24h auto-release
  ORDER_EXPIRED = 'order_expired', // 72h fulfillment expired
  FULFILLMENT_REMINDER = 'fulfillment_reminder', // nudge seller while AWAITING_SELLER
  ESCROW_RELEASED = 'escrow_released',
  ESCROW_CANCELLED = 'escrow_cancelled',
  ESCROW_DISPUTED = 'escrow_disputed',

  // Reviews
  REVIEW_RECEIVED = 'review_received',

  // Listings
  LISTING_FAVORITED = 'listing_favorited',
  LISTING_SOLD = 'listing_sold',

  // Social
  POST_REACTION = 'post_reaction',
  POST_COMMENT = 'post_comment',
  COMMENT_REPLY = 'comment_reply',

  // Housing
  ROOMMATE_INTEREST = 'roommate_interest',
  ROOMMATE_MATCH = 'roommate_match',

  // System
  VERIFICATION_APPROVED = 'verification_approved',
  VERIFICATION_REJECTED = 'verification_rejected',
  WARNING_ISSUED = 'warning_issued',
  ACCOUNT_BANNED = 'account_banned',
  ANNOUNCEMENT = 'announcement',
}

@Entity('notifications')
@Index(['userId', 'isRead', 'createdAt'])
@Index(['userId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  @Index()
  type: NotificationType;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  // Additional data for the notification (e.g., IDs, deep links)
  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any> | null;

  // Image URL for rich notifications
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  @Column({ default: false })
  @Index()
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  // Track if push notification was sent
  @Column({ default: false })
  pushSent: boolean;

  @Column({ type: 'timestamp', nullable: true })
  pushSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
