import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1740000000000 implements MigrationInterface {
    name = 'InitialSchema1740000000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create ENUM types
        await queryRunner.query(`
      CREATE TYPE "university_type_enum" AS ENUM('federal', 'state', 'private')
    `);

        await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM('user', 'moderator', 'admin', 'super_admin')
    `);

        await queryRunner.query(`
      CREATE TYPE "verification_tier_enum" AS ENUM('none', 'tier_0', 'tier_1', 'tier_2')
    `);

        await queryRunner.query(`
      CREATE TYPE "tier1_review_status_enum" AS ENUM('not_submitted', 'pending_review', 'pending_school_email', 'approved', 'rejected')
    `);

        await queryRunner.query(`
      CREATE TYPE "year_of_study_enum" AS ENUM('1', '2', '3', '4', '5', '6', 'postgraduate')
    `);

        await queryRunner.query(`
      CREATE TYPE "listing_type_enum" AS ENUM('sell', 'buy_request')
    `);

        await queryRunner.query(`
      CREATE TYPE "listing_category_enum" AS ENUM('electronics', 'furniture', 'books', 'clothing', 'appliances', 'phones', 'laptops', 'accessories', 'sports', 'beauty', 'food', 'services', 'other')
    `);

        await queryRunner.query(`
      CREATE TYPE "listing_condition_enum" AS ENUM('new', 'like_new', 'used_good', 'used_fair')
    `);

        await queryRunner.query(`
      CREATE TYPE "visibility_scope_enum" AS ENUM('department', 'faculty', 'university')
    `);

        await queryRunner.query(`
      CREATE TYPE "delivery_option_enum" AS ENUM('pickup_only', 'delivery_available', 'meetup')
    `);

        await queryRunner.query(`
      CREATE TYPE "listing_status_enum" AS ENUM('active', 'sold', 'in_escrow', 'paused', 'deleted')
    `);

        await queryRunner.query(`
      CREATE TYPE "offer_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'countered', 'expired', 'withdrawn')
    `);

        await queryRunner.query(`
      CREATE TYPE "escrow_status_enum" AS ENUM('awaiting_seller', 'seller_ready', 'delivered', 'completed', 'disputed', 'refunded', 'cancelled', 'expired')
    `);

        await queryRunner.query(`
      CREATE TYPE "platform_transaction_type_enum" AS ENUM('escrow_fee', 'cancellation_fee')
    `);

        await queryRunner.query(`
      CREATE TYPE "wallet_transaction_type_enum" AS ENUM('deposit', 'withdrawal', 'escrow_hold', 'escrow_release', 'escrow_refund', 'fee')
    `);

        await queryRunner.query(`
      CREATE TYPE "wallet_transaction_status_enum" AS ENUM('pending', 'completed', 'failed', 'reversed')
    `);

        await queryRunner.query(`
      CREATE TYPE "review_type_enum" AS ENUM('buyer_to_seller', 'seller_to_buyer')
    `);

        await queryRunner.query(`
      CREATE TYPE "dispute_status_enum" AS ENUM('open', 'under_review', 'resolved_buyer', 'resolved_seller', 'resolved_split', 'closed')
    `);

        await queryRunner.query(`
      CREATE TYPE "dispute_reason_enum" AS ENUM('item_not_received', 'item_not_as_described', 'item_damaged', 'seller_unresponsive', 'buyer_unresponsive', 'payment_issue', 'fraud', 'other')
    `);

        await queryRunner.query(`
      CREATE TYPE "post_visibility_enum" AS ENUM('university', 'faculty', 'department')
    `);

        await queryRunner.query(`
      CREATE TYPE "reaction_type_enum" AS ENUM('like', 'love', 'laugh', 'wow', 'sad', 'angry')
    `);

        await queryRunner.query(`
      CREATE TYPE "housing_type_enum" AS ENUM('apartment', 'room', 'shared_room', 'hostel', 'self_contain', 'flat')
    `);

        await queryRunner.query(`
      CREATE TYPE "housing_status_enum" AS ENUM('available', 'rented', 'reserved', 'paused', 'deleted')
    `);

        await queryRunner.query(`
      CREATE TYPE "furnishing_status_enum" AS ENUM('furnished', 'semi_furnished', 'unfurnished')
    `);

        await queryRunner.query(`
      CREATE TYPE "gender_preference_enum" AS ENUM('male_only', 'female_only', 'any')
    `);

        await queryRunner.query(`
      CREATE TYPE "payment_frequency_enum" AS ENUM('monthly', 'quarterly', 'yearly')
    `);

        await queryRunner.query(`
      CREATE TYPE "gender_enum" AS ENUM('male', 'female')
    `);

        await queryRunner.query(`
      CREATE TYPE "cleanliness_level_enum" AS ENUM('very_clean', 'clean', 'moderate', 'relaxed')
    `);

        await queryRunner.query(`
      CREATE TYPE "noise_level_enum" AS ENUM('very_quiet', 'quiet', 'moderate', 'social')
    `);

        await queryRunner.query(`
      CREATE TYPE "sleep_schedule_enum" AS ENUM('early_bird', 'normal', 'night_owl', 'flexible')
    `);

        await queryRunner.query(`
      CREATE TYPE "study_habit_enum" AS ENUM('quiet_studier', 'background_noise', 'library_studier', 'flexible')
    `);

        await queryRunner.query(`
      CREATE TYPE "roommate_profile_status_enum" AS ENUM('active', 'paused', 'matched', 'deleted')
    `);

        await queryRunner.query(`
      CREATE TYPE "roommate_interest_status_enum" AS ENUM('pending', 'accepted', 'declined')
    `);

        await queryRunner.query(`
      CREATE TYPE "conversation_type_enum" AS ENUM('listing_inquiry', 'housing_inquiry', 'buy_request_inquiry', 'roommate_inquiry', 'direct_message')
    `);

        await queryRunner.query(`
      CREATE TYPE "request_urgency_enum" AS ENUM('asap', 'within_a_week', 'flexible')
    `);

        await queryRunner.query(`
      CREATE TYPE "buy_request_status_enum" AS ENUM('open', 'fulfilled', 'cancelled')
    `);

        await queryRunner.query(`
      CREATE TYPE "buy_request_offer_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'expired', 'withdrawn')
    `);

        await queryRunner.query(`
      CREATE TYPE "notification_type_enum" AS ENUM('new_message', 'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired', 'escrow_initiated', 'escrow_confirmed', 'escrow_released', 'escrow_cancelled', 'escrow_disputed', 'review_received', 'listing_favorited', 'listing_sold', 'post_reaction', 'post_comment', 'comment_reply', 'roommate_interest', 'roommate_match', 'verification_approved', 'verification_rejected', 'warning_issued', 'account_banned', 'announcement', 'seller_ready', 'delivery_code_sent', 'delivery_confirmed', 'order_auto_completed', 'order_expired')
    `);

        await queryRunner.query(`
      CREATE TYPE "document_type_enum" AS ENUM('student_id_front', 'student_id_back', 'school_fees_receipt', 'tuition_receipt', 'admission_letter')
    `);

        await queryRunner.query(`
      CREATE TYPE "document_status_enum" AS ENUM('pending', 'approved', 'rejected')
    `);

        await queryRunner.query(`
      CREATE TYPE "kyc_type_enum" AS ENUM('bvn', 'nin')
    `);

        await queryRunner.query(`
      CREATE TYPE "kyc_status_enum" AS ENUM('pending', 'success', 'failed')
    `);

        await queryRunner.query(`
      CREATE TYPE "email_verification_type_enum" AS ENUM('personal', 'school')
    `);

        await queryRunner.query(`
      CREATE TYPE "report_type_enum" AS ENUM('post', 'comment', 'listing', 'user', 'message', 'housing')
    `);

        await queryRunner.query(`
      CREATE TYPE "report_reason_enum" AS ENUM('spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'scam', 'fake_listing', 'impersonation', 'misinformation', 'illegal_content', 'underage', 'self_harm', 'other')
    `);

        await queryRunner.query(`
      CREATE TYPE "report_status_enum" AS ENUM('pending', 'under_review', 'action_taken', 'dismissed')
    `);

        await queryRunner.query(`
      CREATE TYPE "report_action_enum" AS ENUM('none', 'warning_issued', 'content_removed', 'user_banned_temp', 'user_banned_perm')
    `);

        await queryRunner.query(`
      CREATE TYPE "article_status_enum" AS ENUM('draft', 'published', 'archived')
    `);

        await queryRunner.query(`
      CREATE TYPE "article_category_enum" AS ENUM('news', 'tips', 'announcements', 'campus_life', 'safety', 'events', 'marketplace_tips', 'housing', 'general')
    `);

        await queryRunner.query(`
      CREATE TYPE "device_platform_enum" AS ENUM('ios', 'android', 'web')
    `);

        await queryRunner.query(`
      CREATE TYPE "ban_appeal_status_enum" AS ENUM('pending', 'under_review', 'approved', 'rejected')
    `);

        await queryRunner.query(`
      CREATE TYPE "moderation_content_type_enum" AS ENUM('post', 'comment', 'listing', 'message', 'profile', 'housing')
    `);

        await queryRunner.query(`
      CREATE TYPE "moderation_source_enum" AS ENUM('ai_flag', 'keyword_flag', 'user_report', 'manual')
    `);

        await queryRunner.query(`
      CREATE TYPE "moderation_status_enum" AS ENUM('pending', 'in_review', 'approved', 'rejected', 'removed')
    `);

        await queryRunner.query(`
      CREATE TYPE "moderation_category_enum" AS ENUM('spam', 'hate_speech', 'harassment', 'violence', 'adult_content', 'scam', 'misinformation', 'personal_info', 'other')
    `);

        await queryRunner.query(`
      CREATE TYPE "warning_reason_enum" AS ENUM('spam', 'harassment', 'inappropriate_content', 'policy_violation', 'scam_attempt', 'other')
    `);

        // Create sequence for order numbers
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1`);

        // Create tables
        // 1. universities
        await queryRunner.query(`
      CREATE TABLE "universities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "code" character varying(50) NOT NULL,
        "state" character varying(100),
        "city" character varying(100),
        "address" text,
        "website" character varying(255),
        "type" "university_type_enum" NOT NULL DEFAULT 'federal',
        "isActive" boolean NOT NULL DEFAULT true,
        "cancellationFeePercent" numeric(5,2) NOT NULL DEFAULT 10,
        "cancellationFeeEnabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_universities" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_universities_code" UNIQUE ("code")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_universities_name" ON "universities" ("name")`);

        // 2. faculties
        await queryRunner.query(`
      CREATE TABLE "faculties" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "code" character varying(50),
        "university_id" uuid NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_faculties" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_faculties_university_name" ON "faculties" ("university_id", "name")`);

        await queryRunner.query(`
      ALTER TABLE "faculties"
      ADD CONSTRAINT "FK_faculties_university_id"
      FOREIGN KEY ("university_id")
      REFERENCES "universities"("id")
      ON DELETE CASCADE
    `);

        // 3. departments
        await queryRunner.query(`
      CREATE TABLE "departments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "code" character varying(50),
        "faculty_id" uuid NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_departments" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_departments_faculty_name" ON "departments" ("faculty_id", "name")`);

        await queryRunner.query(`
      ALTER TABLE "departments"
      ADD CONSTRAINT "FK_departments_faculty_id"
      FOREIGN KEY ("faculty_id")
      REFERENCES "faculties"("id")
      ON DELETE CASCADE
    `);

        // 4. users
        await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" character varying(20) NOT NULL,
        "phoneVerified" boolean NOT NULL DEFAULT false,
        "phoneVerifiedAt" TIMESTAMP,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "emailVerifiedAt" TIMESTAMP,
        "role" "user_role_enum" NOT NULL DEFAULT 'user',
        "email" character varying(255) NOT NULL,
        "passwordHash" character varying(255) NOT NULL,
        "fullName" character varying(255) NOT NULL,
        "profilePhotoUrl" character varying(500),
        "bio" text,
        "yearOfStudy" "year_of_study_enum",
        "university_id" uuid NOT NULL,
        "faculty_id" uuid NOT NULL,
        "department_id" uuid NOT NULL,
        "verificationTier" "verification_tier_enum" NOT NULL DEFAULT 'none',
        "schoolEmail" character varying(255),
        "schoolEmailVerified" boolean NOT NULL DEFAULT false,
        "schoolEmailVerifiedAt" TIMESTAMP,
        "tier1ReviewStatus" "tier1_review_status_enum" NOT NULL DEFAULT 'not_submitted',
        "tier1ApprovedAt" TIMESTAMP,
        "tier1ApprovedBy" character varying(255),
        "tier1RejectionCount" integer NOT NULL DEFAULT 0,
        "tier1RejectionReason" text,
        "tier2VerifiedAt" TIMESTAMP,
        "bvnVerified" boolean NOT NULL DEFAULT false,
        "ninVerified" boolean NOT NULL DEFAULT false,
        "kycAttemptCount" integer NOT NULL DEFAULT 0,
        "isBanned" boolean NOT NULL DEFAULT false,
        "banReason" text,
        "banExpiresAt" TIMESTAMP,
        "bannedAt" TIMESTAMP,
        "bannedBy" character varying(255),
        "deviceId" character varying(255),
        "isDeleted" boolean NOT NULL DEFAULT false,
        "deletedAt" TIMESTAMP,
        "isDeactivated" boolean NOT NULL DEFAULT false,
        "scheduledDeletionAt" TIMESTAMP,
        "sellerRating" numeric(3,2) NOT NULL DEFAULT 0,
        "sellerRatingCount" integer NOT NULL DEFAULT 0,
        "buyerRating" numeric(3,2) NOT NULL DEFAULT 0,
        "buyerRatingCount" integer NOT NULL DEFAULT 0,
        "completedTransactions" integer NOT NULL DEFAULT 0,
        "refreshTokenHash" character varying(255),
        "lastLoginAt" TIMESTAMP,
        "lastActiveAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_phone" UNIQUE ("phone"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_users_phone" ON "users" ("phone")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_university_id" ON "users" ("university_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_verificationTier" ON "users" ("verificationTier")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_tier1ReviewStatus" ON "users" ("tier1ReviewStatus")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_isBanned" ON "users" ("isBanned")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_deviceId" ON "users" ("deviceId")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_isDeleted" ON "users" ("isDeleted")`);
        await queryRunner.query(`CREATE INDEX "IDX_users_scheduledDeletionAt" ON "users" ("scheduledDeletionAt")`);

        await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_university_id"
      FOREIGN KEY ("university_id")
      REFERENCES "universities"("id")
      ON DELETE RESTRICT
    `);

        await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_faculty_id"
      FOREIGN KEY ("faculty_id")
      REFERENCES "faculties"("id")
      ON DELETE RESTRICT
    `);

        await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "FK_users_department_id"
      FOREIGN KEY ("department_id")
      REFERENCES "departments"("id")
      ON DELETE RESTRICT
    `);

        // 5. wallets
        await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "balance" numeric(12,2) NOT NULL DEFAULT 0,
        "lockedBalance" numeric(12,2) NOT NULL DEFAULT 0,
        "isLocked" boolean NOT NULL DEFAULT false,
        "lockReason" text,
        "lockedAt" TIMESTAMP,
        "bankAccountNumber" character varying(20),
        "bankCode" character varying(20),
        "bankName" character varying(100),
        "bankAccountName" character varying(255),
        "paystackRecipientCode" character varying(100),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_user_id" UNIQUE ("user_id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_wallets_user_id" ON "wallets" ("user_id")`);

        await queryRunner.query(`
      ALTER TABLE "wallets"
      ADD CONSTRAINT "FK_wallets_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 6. wallet_transactions
        await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "wallet_id" uuid NOT NULL,
        "type" "wallet_transaction_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "status" "wallet_transaction_status_enum" NOT NULL DEFAULT 'pending',
        "reference" character varying(100) NOT NULL,
        "description" text,
        "externalReference" character varying(255),
        "metadata" jsonb,
        "balanceBefore" numeric(12,2),
        "balanceAfter" numeric(12,2),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallet_transactions_reference" UNIQUE ("reference")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_wallet_transactions_wallet_id" ON "wallet_transactions" ("wallet_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_wallet_transactions_reference" ON "wallet_transactions" ("reference")`);
        await queryRunner.query(`CREATE INDEX "IDX_wallet_transactions_wallet_id_createdAt" ON "wallet_transactions" ("wallet_id", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "wallet_transactions"
      ADD CONSTRAINT "FK_wallet_transactions_wallet_id"
      FOREIGN KEY ("wallet_id")
      REFERENCES "wallets"("id")
      ON DELETE CASCADE
    `);

        // 7. listings
        await queryRunner.query(`
      CREATE TABLE "listings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "seller_id" uuid NOT NULL,
        "university_id" uuid NOT NULL,
        "type" "listing_type_enum" NOT NULL DEFAULT 'sell',
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "category" "listing_category_enum" NOT NULL,
        "condition" "listing_condition_enum" NOT NULL,
        "price" numeric(12,2) NOT NULL,
        "isNegotiable" boolean NOT NULL DEFAULT true,
        "visibilityScope" "visibility_scope_enum" NOT NULL DEFAULT 'university',
        "faculty_id" uuid,
        "department_id" uuid,
        "deliveryOption" "delivery_option_enum" NOT NULL DEFAULT 'meetup',
        "meetupLocation" text,
        "status" "listing_status_enum" NOT NULL DEFAULT 'active',
        "viewCount" integer NOT NULL DEFAULT 0,
        "favoriteCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listings" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_listings_seller_id" ON "listings" ("seller_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_listings_university_id" ON "listings" ("university_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_listings_category" ON "listings" ("category")`);
        await queryRunner.query(`CREATE INDEX "IDX_listings_status" ON "listings" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_listings_university_id_status_createdAt" ON "listings" ("university_id", "status", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_listings_university_id_category_status" ON "listings" ("university_id", "category", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_listings_seller_id_status" ON "listings" ("seller_id", "status")`);

        await queryRunner.query(`
      ALTER TABLE "listings"
      ADD CONSTRAINT "FK_listings_seller_id"
      FOREIGN KEY ("seller_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "listings"
      ADD CONSTRAINT "FK_listings_university_id"
      FOREIGN KEY ("university_id")
      REFERENCES "universities"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "listings"
      ADD CONSTRAINT "FK_listings_faculty_id"
      FOREIGN KEY ("faculty_id")
      REFERENCES "faculties"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "listings"
      ADD CONSTRAINT "FK_listings_department_id"
      FOREIGN KEY ("department_id")
      REFERENCES "departments"("id")
      ON DELETE SET NULL
    `);

        // 8. listing_images
        await queryRunner.query(`
      CREATE TABLE "listing_images" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "url" character varying(500) NOT NULL,
        "position" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_listing_images" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_listing_images_listing_id" ON "listing_images" ("listing_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_listing_images_listing_id_position" ON "listing_images" ("listing_id", "position")`);

        await queryRunner.query(`
      ALTER TABLE "listing_images"
      ADD CONSTRAINT "FK_listing_images_listing_id"
      FOREIGN KEY ("listing_id")
      REFERENCES "listings"("id")
      ON DELETE CASCADE
    `);

        // 9. offers
        await queryRunner.query(`
      CREATE TABLE "offers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "listing_id" uuid NOT NULL,
        "buyer_id" uuid NOT NULL,
        "seller_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "status" "offer_status_enum" NOT NULL DEFAULT 'pending',
        "message" text,
        "counterAmount" numeric(12,2),
        "counterMessage" text,
        "respondedAt" TIMESTAMP,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offers" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_offers_listing_id" ON "offers" ("listing_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_offers_buyer_id" ON "offers" ("buyer_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_offers_status" ON "offers" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_offers_listing_id_status_createdAt" ON "offers" ("listing_id", "status", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_offers_buyer_id_status" ON "offers" ("buyer_id", "status")`);

        await queryRunner.query(`
      ALTER TABLE "offers"
      ADD CONSTRAINT "FK_offers_listing_id"
      FOREIGN KEY ("listing_id")
      REFERENCES "listings"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "offers"
      ADD CONSTRAINT "FK_offers_buyer_id"
      FOREIGN KEY ("buyer_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "offers"
      ADD CONSTRAINT "FK_offers_seller_id"
      FOREIGN KEY ("seller_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 10. escrow_transactions
        await queryRunner.query(`
      CREATE TABLE "escrow_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orderNumber" character varying(20) NOT NULL,
        "buyer_id" uuid NOT NULL,
        "seller_id" uuid NOT NULL,
        "listing_id" uuid NOT NULL,
        "offer_id" uuid,
        "amount" numeric(12,2) NOT NULL,
        "status" "escrow_status_enum" NOT NULL DEFAULT 'awaiting_seller',
        "sellerReadyAt" TIMESTAMP,
        "deliveryDate" date,
        "deliveryTime" character varying(5),
        "deliveryLocation" text,
        "deliveredAt" TIMESTAMP,
        "fulfillmentExpiresAt" TIMESTAMP,
        "disputeWindowExpiresAt" TIMESTAMP,
        "platformFee" numeric(12,2) NOT NULL DEFAULT 0,
        "sellerPayout" numeric(12,2) NOT NULL DEFAULT 0,
        "releasedAt" TIMESTAMP,
        "refundedAt" TIMESTAMP,
        "notes" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_escrow_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_escrow_transactions_orderNumber" UNIQUE ("orderNumber")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_orderNumber" ON "escrow_transactions" ("orderNumber")`);
        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_buyer_id" ON "escrow_transactions" ("buyer_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_seller_id" ON "escrow_transactions" ("seller_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_listing_id" ON "escrow_transactions" ("listing_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_status" ON "escrow_transactions" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_status_createdAt" ON "escrow_transactions" ("status", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_buyer_id_status" ON "escrow_transactions" ("buyer_id", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_escrow_transactions_seller_id_status" ON "escrow_transactions" ("seller_id", "status")`);

        await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
      ADD CONSTRAINT "FK_escrow_transactions_buyer_id"
      FOREIGN KEY ("buyer_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
      ADD CONSTRAINT "FK_escrow_transactions_seller_id"
      FOREIGN KEY ("seller_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
      ADD CONSTRAINT "FK_escrow_transactions_listing_id"
      FOREIGN KEY ("listing_id")
      REFERENCES "listings"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "escrow_transactions"
      ADD CONSTRAINT "FK_escrow_transactions_offer_id"
      FOREIGN KEY ("offer_id")
      REFERENCES "offers"("id")
      ON DELETE SET NULL
    `);

        // 10b. delivery_codes
        await queryRunner.query(`
      CREATE TABLE "delivery_codes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "escrow_id" uuid NOT NULL,
        "code" character varying(4) NOT NULL,
        "validFrom" TIMESTAMP NOT NULL,
        "validUntil" TIMESTAMP NOT NULL,
        "isUsed" boolean NOT NULL DEFAULT false,
        "usedAt" TIMESTAMP,
        "isInvalidated" boolean NOT NULL DEFAULT false,
        "invalidatedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_delivery_codes" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_delivery_codes_escrow_id" ON "delivery_codes" ("escrow_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_delivery_codes_code_isUsed" ON "delivery_codes" ("code", "isUsed")`);

        await queryRunner.query(`
      ALTER TABLE "delivery_codes"
      ADD CONSTRAINT "FK_delivery_codes_escrow_id"
      FOREIGN KEY ("escrow_id")
      REFERENCES "escrow_transactions"("id")
      ON DELETE CASCADE
    `);

        // 10c. platform_wallet
        await queryRunner.query(`
      CREATE TABLE "platform_wallet" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "balance" numeric(14,2) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_wallet" PRIMARY KEY ("id")
      )
    `);

        // 10d. platform_wallet_transactions
        await queryRunner.query(`
      CREATE TABLE "platform_wallet_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "platform_wallet_id" uuid NOT NULL,
        "type" "platform_transaction_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "reference" character varying(100) NOT NULL,
        "escrow_id" uuid,
        "description" text,
        "balanceBefore" numeric(14,2) NOT NULL,
        "balanceAfter" numeric(14,2) NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_wallet_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_platform_wallet_transactions_reference" UNIQUE ("reference")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_platform_wallet_transactions_platform_wallet_id" ON "platform_wallet_transactions" ("platform_wallet_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_platform_wallet_transactions_type" ON "platform_wallet_transactions" ("type")`);
        await queryRunner.query(`CREATE INDEX "IDX_platform_wallet_transactions_createdAt" ON "platform_wallet_transactions" ("createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_platform_wallet_transactions_escrow_id" ON "platform_wallet_transactions" ("escrow_id")`);

        await queryRunner.query(`
      ALTER TABLE "platform_wallet_transactions"
      ADD CONSTRAINT "FK_platform_wallet_transactions_platform_wallet_id"
      FOREIGN KEY ("platform_wallet_id")
      REFERENCES "platform_wallet"("id")
      ON DELETE CASCADE
    `);

        // 11. reviews
        await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transaction_id" uuid NOT NULL,
        "reviewer_id" uuid NOT NULL,
        "reviewee_id" uuid NOT NULL,
        "type" "review_type_enum" NOT NULL,
        "rating" smallint NOT NULL,
        "comment" text,
        "isEdited" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reviews_transaction_reviewer_type" UNIQUE ("transaction_id", "reviewer_id", "type")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_reviews_transaction_id" ON "reviews" ("transaction_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_reviews_reviewer_id" ON "reviews" ("reviewer_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_reviews_reviewee_id" ON "reviews" ("reviewee_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_reviews_reviewee_id_type_createdAt" ON "reviews" ("reviewee_id", "type", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "reviews"
      ADD CONSTRAINT "FK_reviews_reviewer_id"
      FOREIGN KEY ("reviewer_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "reviews"
      ADD CONSTRAINT "FK_reviews_reviewee_id"
      FOREIGN KEY ("reviewee_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 12. favorites
        await queryRunner.query(`
      CREATE TABLE "favorites" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "listing_id" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_favorites" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_favorites_user_listing" UNIQUE ("user_id", "listing_id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_favorites_user_id" ON "favorites" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_favorites_listing_id" ON "favorites" ("listing_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_favorites_user_id_createdAt" ON "favorites" ("user_id", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "favorites"
      ADD CONSTRAINT "FK_favorites_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "favorites"
      ADD CONSTRAINT "FK_favorites_listing_id"
      FOREIGN KEY ("listing_id")
      REFERENCES "listings"("id")
      ON DELETE CASCADE
    `);

        // 13. disputes
        await queryRunner.query(`
      CREATE TABLE "disputes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "escrow_id" uuid NOT NULL,
        "opened_by_id" uuid NOT NULL,
        "reason" "dispute_reason_enum" NOT NULL,
        "description" text NOT NULL,
        "evidence" jsonb,
        "status" "dispute_status_enum" NOT NULL DEFAULT 'open',
        "resolved_by_id" uuid,
        "resolution" text,
        "buyerRefundAmount" numeric(12,2),
        "sellerReleaseAmount" numeric(12,2),
        "resolvedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_disputes" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_disputes_escrow_id" ON "disputes" ("escrow_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_disputes_status" ON "disputes" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_disputes_status_createdAt" ON "disputes" ("status", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "disputes"
      ADD CONSTRAINT "FK_disputes_escrow_id"
      FOREIGN KEY ("escrow_id")
      REFERENCES "escrow_transactions"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "disputes"
      ADD CONSTRAINT "FK_disputes_opened_by_id"
      FOREIGN KEY ("opened_by_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "disputes"
      ADD CONSTRAINT "FK_disputes_resolved_by_id"
      FOREIGN KEY ("resolved_by_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

        // 14. posts
        await queryRunner.query(`
      CREATE TABLE "posts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "author_id" uuid NOT NULL,
        "anonymous_id" character varying NOT NULL,
        "university_id" uuid NOT NULL,
        "faculty_id" uuid,
        "department_id" uuid,
        "visibility" "post_visibility_enum" NOT NULL DEFAULT 'university',
        "content" text NOT NULL,
        "image_urls" jsonb NOT NULL DEFAULT '[]',
        "poll" jsonb,
        "reactions" jsonb NOT NULL DEFAULT '[{"type":"like","count":0,"userIds":[]},{"type":"love","count":0,"userIds":[]},{"type":"laugh","count":0,"userIds":[]},{"type":"wow","count":0,"userIds":[]},{"type":"sad","count":0,"userIds":[]},{"type":"angry","count":0,"userIds":[]}]',
        "total_reactions" integer NOT NULL DEFAULT 0,
        "comment_count" integer NOT NULL DEFAULT 0,
        "view_count" integer NOT NULL DEFAULT 0,
        "is_edited" boolean NOT NULL DEFAULT false,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "is_hidden" boolean NOT NULL DEFAULT false,
        "hidden_reason" text,
        "report_count" integer NOT NULL DEFAULT 0,
        "engagement_score" numeric(12,4) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_posts" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_posts_author_id" ON "posts" ("author_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_posts_university_id" ON "posts" ("university_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_posts_is_deleted" ON "posts" ("is_deleted")`);
        await queryRunner.query(`CREATE INDEX "IDX_posts_university_id_created_at" ON "posts" ("university_id", "created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_posts_university_id_visibility_created_at" ON "posts" ("university_id", "visibility", "created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_posts_university_id_engagement_score" ON "posts" ("university_id", "engagement_score")`);
        await queryRunner.query(`CREATE INDEX "IDX_posts_author_id_created_at" ON "posts" ("author_id", "created_at")`);

        // 15. comments
        await queryRunner.query(`
      CREATE TABLE "comments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "post_id" uuid NOT NULL,
        "parent_id" uuid,
        "author_id" uuid NOT NULL,
        "anonymous_id" character varying NOT NULL,
        "content" text NOT NULL,
        "reactions" jsonb NOT NULL DEFAULT '[{"type":"like","count":0,"userIds":[]},{"type":"love","count":0,"userIds":[]},{"type":"laugh","count":0,"userIds":[]}]',
        "total_reactions" integer NOT NULL DEFAULT 0,
        "reply_count" integer NOT NULL DEFAULT 0,
        "depth" integer NOT NULL DEFAULT 0,
        "is_edited" boolean NOT NULL DEFAULT false,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "is_hidden" boolean NOT NULL DEFAULT false,
        "hidden_reason" text,
        "report_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_comments" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_comments_post_id" ON "comments" ("post_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_comments_parent_id" ON "comments" ("parent_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_comments_author_id" ON "comments" ("author_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_comments_is_deleted" ON "comments" ("is_deleted")`);
        await queryRunner.query(`CREATE INDEX "IDX_comments_post_id_created_at" ON "comments" ("post_id", "created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_comments_post_id_parent_id_created_at" ON "comments" ("post_id", "parent_id", "created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_comments_author_id_created_at" ON "comments" ("author_id", "created_at")`);

        await queryRunner.query(`
      ALTER TABLE "comments"
      ADD CONSTRAINT "FK_comments_post_id"
      FOREIGN KEY ("post_id")
      REFERENCES "posts"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "comments"
      ADD CONSTRAINT "FK_comments_parent_id"
      FOREIGN KEY ("parent_id")
      REFERENCES "comments"("id")
      ON DELETE CASCADE
    `);

        // 16. housing_listings
        await queryRunner.query(`
      CREATE TABLE "housing_listings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "landlord_id" uuid NOT NULL,
        "university_id" uuid NOT NULL,
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "type" "housing_type_enum" NOT NULL,
        "status" "housing_status_enum" NOT NULL DEFAULT 'available',
        "price" numeric(12,2) NOT NULL,
        "paymentFrequency" "payment_frequency_enum" NOT NULL,
        "cautionFee" numeric(12,2),
        "agentFee" numeric(12,2),
        "address" character varying(500) NOT NULL,
        "area" character varying(255) NOT NULL,
        "latitude" numeric(10,7),
        "longitude" numeric(10,7),
        "bedrooms" integer NOT NULL DEFAULT 1,
        "bathrooms" integer NOT NULL DEFAULT 1,
        "furnishing" "furnishing_status_enum" NOT NULL DEFAULT 'unfurnished',
        "genderPreference" "gender_preference_enum" NOT NULL DEFAULT 'any',
        "hasWater" boolean NOT NULL DEFAULT false,
        "hasElectricity" boolean NOT NULL DEFAULT false,
        "hasInternet" boolean NOT NULL DEFAULT false,
        "hasParking" boolean NOT NULL DEFAULT false,
        "hasSecurityGuard" boolean NOT NULL DEFAULT false,
        "hasGenerator" boolean NOT NULL DEFAULT false,
        "hasPrepaidMeter" boolean NOT NULL DEFAULT false,
        "isGated" boolean NOT NULL DEFAULT false,
        "allowsPets" boolean NOT NULL DEFAULT false,
        "otherAmenities" jsonb,
        "imageUrls" jsonb NOT NULL DEFAULT '[]',
        "videoUrl" jsonb,
        "rules" text,
        "availableFrom" date,
        "viewCount" integer NOT NULL DEFAULT 0,
        "inquiryCount" integer NOT NULL DEFAULT 0,
        "isVerified" boolean NOT NULL DEFAULT false,
        "verifiedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_housing_listings" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_landlord_id" ON "housing_listings" ("landlord_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_university_id" ON "housing_listings" ("university_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_type" ON "housing_listings" ("type")`);
        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_status" ON "housing_listings" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_price" ON "housing_listings" ("price", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_university_id_status_createdAt" ON "housing_listings" ("university_id", "status", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_university_id_type_status" ON "housing_listings" ("university_id", "type", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_housing_listings_landlord_id_status" ON "housing_listings" ("landlord_id", "status")`);

        await queryRunner.query(`
      ALTER TABLE "housing_listings"
      ADD CONSTRAINT "FK_housing_listings_landlord_id"
      FOREIGN KEY ("landlord_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "housing_listings"
      ADD CONSTRAINT "FK_housing_listings_university_id"
      FOREIGN KEY ("university_id")
      REFERENCES "universities"("id")
      ON DELETE CASCADE
    `);

        // 17. roommate_profiles
        await queryRunner.query(`
      CREATE TABLE "roommate_profiles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "university_id" uuid NOT NULL,
        "status" "roommate_profile_status_enum" NOT NULL DEFAULT 'active',
        "gender" "gender_enum" NOT NULL,
        "age" integer NOT NULL,
        "bio" text,
        "budgetMin" numeric(12,2) NOT NULL,
        "budgetMax" numeric(12,2) NOT NULL,
        "preferredAreas" jsonb NOT NULL DEFAULT '[]',
        "moveInDate" date,
        "moveInFlexible" boolean NOT NULL DEFAULT false,
        "cleanliness" "cleanliness_level_enum" NOT NULL DEFAULT 'clean',
        "noiseLevel" "noise_level_enum" NOT NULL DEFAULT 'moderate',
        "sleepSchedule" "sleep_schedule_enum" NOT NULL DEFAULT 'normal',
        "studyHabit" "study_habit_enum" NOT NULL DEFAULT 'flexible',
        "smokes" boolean NOT NULL DEFAULT false,
        "drinks" boolean NOT NULL DEFAULT false,
        "hasPets" boolean NOT NULL DEFAULT false,
        "allowsVisitors" boolean NOT NULL DEFAULT false,
        "preferredGender" "gender_enum",
        "preferredAgeMin" integer,
        "preferredAgeMax" integer,
        "preferredCleanliness" "cleanliness_level_enum",
        "preferredNoiseLevel" "noise_level_enum",
        "preferredSleepSchedule" "sleep_schedule_enum",
        "nonSmokerOnly" boolean NOT NULL DEFAULT false,
        "nonDrinkerOnly" boolean NOT NULL DEFAULT false,
        "noPetsAllowed" boolean NOT NULL DEFAULT false,
        "interests" jsonb,
        "languages" jsonb,
        "viewCount" integer NOT NULL DEFAULT 0,
        "interestReceivedCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roommate_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roommate_profiles_user_id" UNIQUE ("user_id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_roommate_profiles_user_id" ON "roommate_profiles" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_roommate_profiles_university_id" ON "roommate_profiles" ("university_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_roommate_profiles_status" ON "roommate_profiles" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_roommate_profiles_university_id_status" ON "roommate_profiles" ("university_id", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_roommate_profiles_gender_status" ON "roommate_profiles" ("gender", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_roommate_profiles_budgetMin_budgetMax" ON "roommate_profiles" ("budgetMin", "budgetMax")`);

        await queryRunner.query(`
      ALTER TABLE "roommate_profiles"
      ADD CONSTRAINT "FK_roommate_profiles_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "roommate_profiles"
      ADD CONSTRAINT "FK_roommate_profiles_university_id"
      FOREIGN KEY ("university_id")
      REFERENCES "universities"("id")
      ON DELETE CASCADE
    `);

        // 18. roommate_interests
        await queryRunner.query(`
      CREATE TABLE "roommate_interests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "from_user_id" uuid NOT NULL,
        "to_user_id" uuid NOT NULL,
        "status" "roommate_interest_status_enum" NOT NULL DEFAULT 'pending',
        "message" text,
        "compatibilityScore" numeric(5,2),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roommate_interests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_roommate_interests_from_to" UNIQUE ("from_user_id", "to_user_id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_roommate_interests_from_user_id" ON "roommate_interests" ("from_user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_roommate_interests_to_user_id" ON "roommate_interests" ("to_user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_roommate_interests_to_user_id_status" ON "roommate_interests" ("to_user_id", "status")`);

        await queryRunner.query(`
      ALTER TABLE "roommate_interests"
      ADD CONSTRAINT "FK_roommate_interests_from_user_id"
      FOREIGN KEY ("from_user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "roommate_interests"
      ADD CONSTRAINT "FK_roommate_interests_to_user_id"
      FOREIGN KEY ("to_user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 19. buy_requests
        await queryRunner.query(`
      CREATE TABLE "buy_requests" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requester_id" uuid NOT NULL,
        "university_id" uuid NOT NULL,
        "title" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "category" "listing_category_enum" NOT NULL,
        "budget_min" numeric(12,2) NOT NULL,
        "budget_max" numeric(12,2),
        "is_budget_negotiable" boolean NOT NULL DEFAULT true,
        "urgency" "request_urgency_enum" NOT NULL DEFAULT 'flexible',
        "visibility_scope" "visibility_scope_enum" NOT NULL DEFAULT 'university',
        "faculty_id" uuid,
        "department_id" uuid,
        "status" "buy_request_status_enum" NOT NULL DEFAULT 'open',
        "view_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_buy_requests" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_buy_requests_requester_id" ON "buy_requests" ("requester_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_requests_university_id" ON "buy_requests" ("university_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_requests_category" ON "buy_requests" ("category")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_requests_status" ON "buy_requests" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_requests_university_id_status_created_at" ON "buy_requests" ("university_id", "status", "created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_requests_university_id_category_status" ON "buy_requests" ("university_id", "category", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_requests_requester_id_status" ON "buy_requests" ("requester_id", "status")`);

        await queryRunner.query(`
      ALTER TABLE "buy_requests"
      ADD CONSTRAINT "FK_buy_requests_requester_id"
      FOREIGN KEY ("requester_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "buy_requests"
      ADD CONSTRAINT "FK_buy_requests_university_id"
      FOREIGN KEY ("university_id")
      REFERENCES "universities"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "buy_requests"
      ADD CONSTRAINT "FK_buy_requests_faculty_id"
      FOREIGN KEY ("faculty_id")
      REFERENCES "faculties"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "buy_requests"
      ADD CONSTRAINT "FK_buy_requests_department_id"
      FOREIGN KEY ("department_id")
      REFERENCES "departments"("id")
      ON DELETE SET NULL
    `);

        // 20. conversations
        await queryRunner.query(`
      CREATE TABLE "conversations" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" "conversation_type_enum" NOT NULL DEFAULT 'listing_inquiry',
        "listing_id" uuid,
        "housing_listing_id" uuid,
        "buy_request_id" uuid,
        "roommate_profile_id" uuid,
        "buyer_id" uuid,
        "participant1_id" uuid NOT NULL,
        "participant2_id" uuid NOT NULL,
        "lastMessagePreview" text,
        "lastMessageAt" TIMESTAMP,
        "last_message_sender_id" uuid,
        "participant1UnreadCount" integer NOT NULL DEFAULT 0,
        "participant2UnreadCount" integer NOT NULL DEFAULT 0,
        "isDeletedByParticipant1" boolean NOT NULL DEFAULT false,
        "isDeletedByParticipant2" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conversations_listing_buyer" UNIQUE ("listing_id", "buyer_id"),
        CONSTRAINT "UQ_conversations_housing_buyer" UNIQUE ("housing_listing_id", "buyer_id"),
        CONSTRAINT "UQ_conversations_buyrequest_buyer" UNIQUE ("buy_request_id", "buyer_id"),
        CONSTRAINT "UQ_conversations_roommate_buyer" UNIQUE ("roommate_profile_id", "buyer_id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_conversations_listing_id" ON "conversations" ("listing_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_conversations_housing_listing_id" ON "conversations" ("housing_listing_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_conversations_buy_request_id" ON "conversations" ("buy_request_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_conversations_roommate_profile_id" ON "conversations" ("roommate_profile_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_conversations_participant1_id_updatedAt" ON "conversations" ("participant1_id", "updatedAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_conversations_participant2_id_updatedAt" ON "conversations" ("participant2_id", "updatedAt")`);

        await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_listing_id"
      FOREIGN KEY ("listing_id")
      REFERENCES "listings"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_housing_listing_id"
      FOREIGN KEY ("housing_listing_id")
      REFERENCES "housing_listings"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_buy_request_id"
      FOREIGN KEY ("buy_request_id")
      REFERENCES "buy_requests"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_roommate_profile_id"
      FOREIGN KEY ("roommate_profile_id")
      REFERENCES "roommate_profiles"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_participant1_id"
      FOREIGN KEY ("participant1_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "conversations"
      ADD CONSTRAINT "FK_conversations_participant2_id"
      FOREIGN KEY ("participant2_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 21. messages
        await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "conversation_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "content" text NOT NULL,
        "attachments" jsonb,
        "isRead" boolean NOT NULL DEFAULT false,
        "readAt" TIMESTAMP,
        "isSystemMessage" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_messages" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_messages_conversation_id" ON "messages" ("conversation_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_messages_sender_id" ON "messages" ("sender_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_messages_conversation_id_createdAt" ON "messages" ("conversation_id", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "messages"
      ADD CONSTRAINT "FK_messages_conversation_id"
      FOREIGN KEY ("conversation_id")
      REFERENCES "conversations"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "messages"
      ADD CONSTRAINT "FK_messages_sender_id"
      FOREIGN KEY ("sender_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 22. buy_request_offers
        await queryRunner.query(`
      CREATE TABLE "buy_request_offers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "buy_request_id" uuid NOT NULL,
        "responder_id" uuid NOT NULL,
        "requester_id" uuid NOT NULL,
        "proposed_price" numeric(12,2) NOT NULL,
        "item_condition" "listing_condition_enum" NOT NULL,
        "message" text,
        "image_url" character varying(500),
        "status" "buy_request_offer_status_enum" NOT NULL DEFAULT 'pending',
        "expires_at" TIMESTAMP NOT NULL,
        "responded_at" TIMESTAMP,
        "conversation_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_buy_request_offers" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_buy_request_offers_buy_request_id" ON "buy_request_offers" ("buy_request_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_request_offers_responder_id" ON "buy_request_offers" ("responder_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_request_offers_requester_id" ON "buy_request_offers" ("requester_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_request_offers_status" ON "buy_request_offers" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_request_offers_buy_request_id_status_created_at" ON "buy_request_offers" ("buy_request_id", "status", "created_at")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_request_offers_responder_id_status" ON "buy_request_offers" ("responder_id", "status")`);
        await queryRunner.query(`CREATE INDEX "IDX_buy_request_offers_requester_id_status" ON "buy_request_offers" ("requester_id", "status")`);

        await queryRunner.query(`
      ALTER TABLE "buy_request_offers"
      ADD CONSTRAINT "FK_buy_request_offers_buy_request_id"
      FOREIGN KEY ("buy_request_id")
      REFERENCES "buy_requests"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "buy_request_offers"
      ADD CONSTRAINT "FK_buy_request_offers_responder_id"
      FOREIGN KEY ("responder_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "buy_request_offers"
      ADD CONSTRAINT "FK_buy_request_offers_requester_id"
      FOREIGN KEY ("requester_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "buy_request_offers"
      ADD CONSTRAINT "FK_buy_request_offers_conversation_id"
      FOREIGN KEY ("conversation_id")
      REFERENCES "conversations"("id")
      ON DELETE SET NULL
    `);

        // 23. notifications
        await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "notification_type_enum" NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "imageUrl" character varying(500),
        "isRead" boolean NOT NULL DEFAULT false,
        "readAt" TIMESTAMP,
        "pushSent" boolean NOT NULL DEFAULT false,
        "pushSentAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_type" ON "notifications" ("type")`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_isRead" ON "notifications" ("isRead")`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id_isRead_createdAt" ON "notifications" ("user_id", "isRead", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id_createdAt" ON "notifications" ("user_id", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "notifications"
      ADD CONSTRAINT "FK_notifications_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 24. notification_preferences
        await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "pushEnabled" boolean NOT NULL DEFAULT true,
        "emailEnabled" boolean NOT NULL DEFAULT true,
        "messagesEnabled" boolean NOT NULL DEFAULT true,
        "offersEnabled" boolean NOT NULL DEFAULT true,
        "escrowEnabled" boolean NOT NULL DEFAULT true,
        "reviewsEnabled" boolean NOT NULL DEFAULT true,
        "socialEnabled" boolean NOT NULL DEFAULT true,
        "housingEnabled" boolean NOT NULL DEFAULT true,
        "announcementsEnabled" boolean NOT NULL DEFAULT true,
        "quietHoursEnabled" boolean NOT NULL DEFAULT false,
        "quietHoursStart" time,
        "quietHoursEnd" time,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_preferences_user_id" UNIQUE ("user_id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_notification_preferences_user_id" ON "notification_preferences" ("user_id")`);

        await queryRunner.query(`
      ALTER TABLE "notification_preferences"
      ADD CONSTRAINT "FK_notification_preferences_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 25. fcm_tokens
        await queryRunner.query(`
      CREATE TABLE "fcm_tokens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "token" character varying(500) NOT NULL,
        "platform" "device_platform_enum" NOT NULL,
        "deviceId" character varying(255),
        "deviceName" character varying(100),
        "isActive" boolean NOT NULL DEFAULT true,
        "lastUsedAt" TIMESTAMP,
        "failureCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_fcm_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_fcm_tokens_token" UNIQUE ("token")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_fcm_tokens_user_id" ON "fcm_tokens" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_fcm_tokens_token" ON "fcm_tokens" ("token")`);
        await queryRunner.query(`CREATE INDEX "IDX_fcm_tokens_isActive" ON "fcm_tokens" ("isActive")`);
        await queryRunner.query(`CREATE INDEX "IDX_fcm_tokens_user_id_isActive" ON "fcm_tokens" ("user_id", "isActive")`);

        await queryRunner.query(`
      ALTER TABLE "fcm_tokens"
      ADD CONSTRAINT "FK_fcm_tokens_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 26. verification_documents
        await queryRunner.query(`
      CREATE TABLE "verification_documents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "document_type_enum" NOT NULL,
        "documentUrl" character varying(500) NOT NULL,
        "status" "document_status_enum" NOT NULL DEFAULT 'pending',
        "rejectionReason" text,
        "reviewedAt" TIMESTAMP,
        "reviewedBy" character varying(255),
        "metadata" jsonb,
        "submissionAttempt" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_verification_documents" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_verification_documents_user_id" ON "verification_documents" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_verification_documents_status" ON "verification_documents" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_verification_documents_user_id_type" ON "verification_documents" ("user_id", "type")`);

        await queryRunner.query(`
      ALTER TABLE "verification_documents"
      ADD CONSTRAINT "FK_verification_documents_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 27. kyc_verifications
        await queryRunner.query(`
      CREATE TABLE "kyc_verifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "kyc_type_enum" NOT NULL,
        "status" "kyc_status_enum" NOT NULL DEFAULT 'pending',
        "youverifyReference" character varying(255),
        "attemptNumber" integer NOT NULL DEFAULT 1,
        "failureReason" text,
        "verifiedAt" TIMESTAMP,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kyc_verifications" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_kyc_verifications_user_id" ON "kyc_verifications" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_kyc_verifications_status" ON "kyc_verifications" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_kyc_verifications_user_id_type" ON "kyc_verifications" ("user_id", "type")`);

        await queryRunner.query(`
      ALTER TABLE "kyc_verifications"
      ADD CONSTRAINT "FK_kyc_verifications_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 28. email_verifications
        await queryRunner.query(`
      CREATE TABLE "email_verifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "email" character varying(255) NOT NULL,
        "type" "email_verification_type_enum" NOT NULL,
        "token" character varying(255) NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "verifiedAt" TIMESTAMP,
        "resendCount" integer NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_verifications" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_email_verifications_token" UNIQUE ("token")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_email_verifications_user_id" ON "email_verifications" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_email_verifications_token" ON "email_verifications" ("token")`);
        await queryRunner.query(`CREATE INDEX "IDX_email_verifications_user_id_type" ON "email_verifications" ("user_id", "type")`);

        await queryRunner.query(`
      ALTER TABLE "email_verifications"
      ADD CONSTRAINT "FK_email_verifications_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 29. password_resets
        await queryRunner.query(`
      CREATE TABLE "password_resets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "email" character varying(255) NOT NULL,
        "token" character varying(255) NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "usedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_resets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_password_resets_token" UNIQUE ("token")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_password_resets_token" ON "password_resets" ("token")`);
        await queryRunner.query(`CREATE INDEX "IDX_password_resets_user_id" ON "password_resets" ("user_id")`);

        await queryRunner.query(`
      ALTER TABLE "password_resets"
      ADD CONSTRAINT "FK_password_resets_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        // 30. reports
        await queryRunner.query(`
      CREATE TABLE "reports" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reporter_id" uuid NOT NULL,
        "type" "report_type_enum" NOT NULL,
        "target_id" uuid NOT NULL,
        "reported_user_id" uuid,
        "reason" "report_reason_enum" NOT NULL,
        "description" text,
        "evidence" jsonb,
        "status" "report_status_enum" NOT NULL DEFAULT 'pending',
        "action" "report_action_enum",
        "reviewed_by_id" uuid,
        "reviewNotes" text,
        "reviewedAt" TIMESTAMP,
        "priority" integer NOT NULL DEFAULT 0,
        "reportCount" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reports" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_reports_reporter_id" ON "reports" ("reporter_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_reports_target_id" ON "reports" ("target_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_reports_reported_user_id" ON "reports" ("reported_user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_reports_status" ON "reports" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_reports_priority" ON "reports" ("priority")`);
        await queryRunner.query(`CREATE INDEX "IDX_reports_status_createdAt" ON "reports" ("status", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_reports_type_target_id" ON "reports" ("type", "target_id")`);

        await queryRunner.query(`
      ALTER TABLE "reports"
      ADD CONSTRAINT "FK_reports_reporter_id"
      FOREIGN KEY ("reporter_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "reports"
      ADD CONSTRAINT "FK_reports_reported_user_id"
      FOREIGN KEY ("reported_user_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "reports"
      ADD CONSTRAINT "FK_reports_reviewed_by_id"
      FOREIGN KEY ("reviewed_by_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

        // 31. articles
        await queryRunner.query(`
      CREATE TABLE "articles" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "title" character varying(255) NOT NULL,
        "slug" character varying(300) NOT NULL,
        "excerpt" text,
        "content" text NOT NULL,
        "coverImageUrl" character varying(500),
        "category" "article_category_enum" NOT NULL DEFAULT 'general',
        "tags" jsonb,
        "status" "article_status_enum" NOT NULL DEFAULT 'draft',
        "isFeatured" boolean NOT NULL DEFAULT false,
        "author_id" uuid NOT NULL,
        "viewCount" integer NOT NULL DEFAULT 0,
        "bookmarkCount" integer NOT NULL DEFAULT 0,
        "publishedAt" TIMESTAMP,
        "metaDescription" character varying(160),
        "metaKeywords" jsonb,
        "readingTime" integer NOT NULL DEFAULT 1,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_articles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_articles_slug" UNIQUE ("slug")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_articles_slug" ON "articles" ("slug")`);
        await queryRunner.query(`CREATE INDEX "IDX_articles_category" ON "articles" ("category")`);
        await queryRunner.query(`CREATE INDEX "IDX_articles_status" ON "articles" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_articles_isFeatured" ON "articles" ("isFeatured")`);
        await queryRunner.query(`CREATE INDEX "IDX_articles_publishedAt" ON "articles" ("publishedAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_articles_status_publishedAt" ON "articles" ("status", "publishedAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_articles_category_status" ON "articles" ("category", "status")`);

        await queryRunner.query(`
      ALTER TABLE "articles"
      ADD CONSTRAINT "FK_articles_author_id"
      FOREIGN KEY ("author_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

        // 32. article_bookmarks
        await queryRunner.query(`
      CREATE TABLE "article_bookmarks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "article_id" uuid NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_article_bookmarks" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_article_bookmarks_user_article" UNIQUE ("user_id", "article_id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_article_bookmarks_user_id" ON "article_bookmarks" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_article_bookmarks_article_id" ON "article_bookmarks" ("article_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_article_bookmarks_user_id_createdAt" ON "article_bookmarks" ("user_id", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "article_bookmarks"
      ADD CONSTRAINT "FK_article_bookmarks_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "article_bookmarks"
      ADD CONSTRAINT "FK_article_bookmarks_article_id"
      FOREIGN KEY ("article_id")
      REFERENCES "articles"("id")
      ON DELETE CASCADE
    `);

        // 33. ban_appeals
        await queryRunner.query(`
      CREATE TABLE "ban_appeals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "reason" text NOT NULL,
        "evidence" jsonb,
        "status" "ban_appeal_status_enum" NOT NULL DEFAULT 'pending',
        "reviewed_by_id" uuid,
        "reviewNotes" text,
        "reviewedAt" TIMESTAMP,
        "originalBanReason" text,
        "originalBanDate" TIMESTAMP,
        "originalBanExpiry" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ban_appeals" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_ban_appeals_user_id" ON "ban_appeals" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_ban_appeals_status" ON "ban_appeals" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_ban_appeals_status_createdAt" ON "ban_appeals" ("status", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "ban_appeals"
      ADD CONSTRAINT "FK_ban_appeals_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "ban_appeals"
      ADD CONSTRAINT "FK_ban_appeals_reviewed_by_id"
      FOREIGN KEY ("reviewed_by_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

        // 34. moderation_queue
        await queryRunner.query(`
      CREATE TABLE "moderation_queue" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contentType" "moderation_content_type_enum" NOT NULL,
        "content_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "source" "moderation_source_enum" NOT NULL,
        "category" "moderation_category_enum",
        "aiScore" numeric(5,4),
        "aiDetails" jsonb,
        "flaggedKeywords" jsonb,
        "contentSnapshot" text,
        "status" "moderation_status_enum" NOT NULL DEFAULT 'pending',
        "priority" integer NOT NULL DEFAULT 50,
        "reviewed_by_id" uuid,
        "reviewNotes" text,
        "reviewedAt" TIMESTAMP,
        "actionTaken" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_moderation_queue" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_moderation_queue_content_id" ON "moderation_queue" ("content_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_moderation_queue_user_id" ON "moderation_queue" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_moderation_queue_status" ON "moderation_queue" ("status")`);
        await queryRunner.query(`CREATE INDEX "IDX_moderation_queue_priority" ON "moderation_queue" ("priority")`);
        await queryRunner.query(`CREATE INDEX "IDX_moderation_queue_status_priority_createdAt" ON "moderation_queue" ("status", "priority", "createdAt")`);
        await queryRunner.query(`CREATE INDEX "IDX_moderation_queue_contentType_content_id" ON "moderation_queue" ("contentType", "content_id")`);

        await queryRunner.query(`
      ALTER TABLE "moderation_queue"
      ADD CONSTRAINT "FK_moderation_queue_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "moderation_queue"
      ADD CONSTRAINT "FK_moderation_queue_reviewed_by_id"
      FOREIGN KEY ("reviewed_by_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

        // 35. warnings
        await queryRunner.query(`
      CREATE TABLE "warnings" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "issued_by_id" uuid NOT NULL,
        "reason" "warning_reason_enum" NOT NULL,
        "message" text NOT NULL,
        "report_id" uuid,
        "acknowledged" boolean NOT NULL DEFAULT false,
        "acknowledgedAt" TIMESTAMP,
        "expiresAt" TIMESTAMP,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_warnings" PRIMARY KEY ("id")
      )
    `);

        await queryRunner.query(`CREATE INDEX "IDX_warnings_user_id" ON "warnings" ("user_id")`);
        await queryRunner.query(`CREATE INDEX "IDX_warnings_user_id_createdAt" ON "warnings" ("user_id", "createdAt")`);

        await queryRunner.query(`
      ALTER TABLE "warnings"
      ADD CONSTRAINT "FK_warnings_user_id"
      FOREIGN KEY ("user_id")
      REFERENCES "users"("id")
      ON DELETE CASCADE
    `);

        await queryRunner.query(`
      ALTER TABLE "warnings"
      ADD CONSTRAINT "FK_warnings_issued_by_id"
      FOREIGN KEY ("issued_by_id")
      REFERENCES "users"("id")
      ON DELETE SET NULL
    `);

        await queryRunner.query(`
      ALTER TABLE "warnings"
      ADD CONSTRAINT "FK_warnings_report_id"
      FOREIGN KEY ("report_id")
      REFERENCES "reports"("id")
      ON DELETE SET NULL
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order of creation
        await queryRunner.query(`DROP TABLE IF EXISTS "warnings" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "moderation_queue" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ban_appeals" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "article_bookmarks" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "articles" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "reports" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "password_resets" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "email_verifications" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "kyc_verifications" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "verification_documents" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fcm_tokens" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "buy_request_offers" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "messages" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "conversations" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "buy_requests" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "roommate_interests" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "roommate_profiles" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "housing_listings" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "comments" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "posts" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "disputes" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "favorites" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "reviews" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "platform_wallet_transactions" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "platform_wallet" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "delivery_codes" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "escrow_transactions" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "offers" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "listing_images" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "listings" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallet_transactions" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallets" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "departments" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "faculties" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "universities" CASCADE`);

        // Drop ENUM types
        await queryRunner.query(`DROP TYPE IF EXISTS "warning_reason_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "moderation_category_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "moderation_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "moderation_source_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "moderation_content_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "ban_appeal_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "device_platform_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "article_category_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "article_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "report_action_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "report_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "report_reason_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "report_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "email_verification_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "kyc_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "kyc_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "document_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "document_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "notification_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "buy_request_offer_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "buy_request_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "request_urgency_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "conversation_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "roommate_interest_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "roommate_profile_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "study_habit_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "sleep_schedule_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "noise_level_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "cleanliness_level_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "gender_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "payment_frequency_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "gender_preference_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "furnishing_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "housing_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "housing_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "reaction_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "post_visibility_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "dispute_reason_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "dispute_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "review_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "wallet_transaction_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "wallet_transaction_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "platform_transaction_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "escrow_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "offer_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "listing_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "delivery_option_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "visibility_scope_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "listing_condition_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "listing_category_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "listing_type_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "year_of_study_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "tier1_review_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "verification_tier_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "university_type_enum"`);

        // Drop sequence
        await queryRunner.query(`DROP SEQUENCE IF EXISTS order_number_seq`);
    }
}
