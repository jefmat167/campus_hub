import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Listing } from './listing.entity';
import { HousingListing } from './housing.entity';

export enum ConversationType {
  LISTING_INQUIRY = 'listing_inquiry',
  HOUSING_INQUIRY = 'housing_inquiry',
  DIRECT_MESSAGE = 'direct_message',
}

@Entity('conversations')
@Unique(['listingId', 'buyerId']) // One conversation per buyer per listing
@Unique(['housingListingId', 'buyerId']) // One conversation per buyer per housing listing
@Index(['participant1Id', 'updatedAt'])
@Index(['participant2Id', 'updatedAt'])
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: ConversationType,
    default: ConversationType.LISTING_INQUIRY,
  })
  type: ConversationType;

  // For marketplace listing inquiries
  @Column({ type: 'uuid', name: 'listing_id', nullable: true })
  @Index()
  listingId: string | null;

  @ManyToOne(() => Listing, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'listing_id' })
  listing: Listing | null;

  // For housing listing inquiries
  @Column({ type: 'uuid', name: 'housing_listing_id', nullable: true })
  @Index()
  housingListingId: string | null;

  @ManyToOne(() => HousingListing, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'housing_listing_id' })
  housingListing: HousingListing | null;

  // Buyer/Inquirer (the one who initiated)
  @Column({ type: 'uuid', name: 'buyer_id', nullable: true })
  buyerId: string | null;

  // Participants
  @Column({ name: 'participant1_id' })
  participant1Id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant1_id' })
  participant1: User;

  @Column({ name: 'participant2_id' })
  participant2Id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'participant2_id' })
  participant2: User;

  // Last message preview
  @Column({ type: 'text', nullable: true })
  lastMessagePreview: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'uuid', name: 'last_message_sender_id', nullable: true })
  lastMessageSenderId: string | null;

  // Unread counts
  @Column({ default: 0 })
  participant1UnreadCount: number;

  @Column({ default: 0 })
  participant2UnreadCount: number;

  // Soft delete / archive
  @Column({ default: false })
  isDeletedByParticipant1: boolean;

  @Column({ default: false })
  isDeletedByParticipant2: boolean;

  @OneToMany(() => Message, (message) => message.conversation)
  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('messages')
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'conversation_id' })
  @Index()
  conversationId: string;

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @Column({ name: 'sender_id' })
  @Index()
  senderId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;

  @Column({ type: 'text' })
  content: string;

  // Attachments (image URLs)
  @Column({ type: 'jsonb', nullable: true })
  attachments: string[] | null;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date | null;

  // For system messages (offer accepted, etc.)
  @Column({ default: false })
  isSystemMessage: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
