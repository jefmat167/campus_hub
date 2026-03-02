import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1740000000000 implements MigrationInterface {
    name = 'InitialSchema1740000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create all enums first
        await queryRunner.query(`
            CREATE TYPE "verification_tier_enum" AS ENUM('none', 'tier_0', 'tier_1', 'tier_2');
            CREATE TYPE "tier1_review_status_enum" AS ENUM('not_submitted', 'pending_review', 'pending_school_email', 'approved', 'rejected');
            CREATE TYPE "user_role_enum" AS ENUM('user', 'moderator', 'admin', 'super_admin');
            CREATE TYPE "year_of_study_enum" AS ENUM('1', '2', '3', '4', '5', '6', 'postgraduate');
            CREATE TYPE "university_type_enum" AS ENUM('federal', 'state', 'private');
            CREATE TYPE "email_verification_type_enum" AS ENUM('personal', 'school');
            CREATE TYPE "wallet_transaction_type_enum" AS ENUM('deposit', 'withdrawal', 'escrow_hold', 'escrow_release', 'escrow_refund', 'fee');
            CREATE TYPE "wallet_transaction_status_enum" AS ENUM('pending', 'completed', 'failed', 'reversed');
            CREATE TYPE "listing_type_enum" AS ENUM('sell', 'buy_request');
            CREATE TYPE "listing_category_enum" AS ENUM('electronics', 'furniture', 'books', 'clothing', 'appliances', 'phones', 'laptops', 'accessories', 'sports', 'beauty', 'food', 'services', 'other');
            CREATE TYPE "listing_condition_enum" AS ENUM('new', 'like_new', 'used_good', 'used_fair');
            CREATE TYPE "visibility_scope_enum" AS ENUM('department', 'faculty', 'university');
            CREATE TYPE "delivery_option_enum" AS ENUM('pickup_only', 'delivery_available', 'meetup');
            CREATE TYPE "listing_status_enum" AS ENUM('active', 'sold', 'in_escrow', 'paused', 'deleted');
            CREATE TYPE "offer_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'countered', 'expired', 'withdrawn');
            CREATE TYPE "escrow_status_enum" AS ENUM('pending', 'buyer_confirmed', 'seller_confirmed', 'completed', 'disputed', 'refunded', 'cancelled', 'expired');
            CREATE TYPE "dispute_status_enum" AS ENUM('open', 'under_review', 'resolved_buyer', 'resolved_seller', 'resolved_split', 'closed');
            CREATE TYPE "dispute_reason_enum" AS ENUM('item_not_received', 'item_not_as_described', 'item_damaged', 'seller_unresponsive', 'buyer_unresponsive', 'payment_issue', 'fraud', 'other');
            CREATE TYPE "review_type_enum" AS ENUM('buyer_to_seller', 'seller_to_buyer');
            CREATE TYPE "housing_type_enum" AS ENUM('apartment', 'room', 'shared_room', 'hostel', 'self_contain', 'flat');
            CREATE TYPE "housing_status_enum" AS ENUM('available', 'rented', 'reserved', 'paused', 'deleted');
            CREATE TYPE "furnishing_status_enum" AS ENUM('furnished', 'semi_furnished', 'unfurnished');
            CREATE TYPE "gender_preference_enum" AS ENUM('male_only', 'female_only', 'any');
            CREATE TYPE "payment_frequency_enum" AS ENUM('monthly', 'quarterly', 'yearly');
            CREATE TYPE "gender_enum" AS ENUM('male', 'female');
            CREATE TYPE "cleanliness_level_enum" AS ENUM('very_clean', 'clean', 'moderate', 'relaxed');
            CREATE TYPE "noise_level_enum" AS ENUM('very_quiet', 'quiet', 'moderate', 'social');
            CREATE TYPE "sleep_schedule_enum" AS ENUM('early_bird', 'normal', 'night_owl', 'flexible');
            CREATE TYPE "study_habit_enum" AS ENUM('quiet_studier', 'background_noise', 'library_studier', 'flexible');
            CREATE TYPE "roommate_profile_status_enum" AS ENUM('active', 'paused', 'matched', 'deleted');
            CREATE TYPE "roommate_interest_status_enum" AS ENUM('pending', 'accepted', 'declined');
            CREATE TYPE "request_urgency_enum" AS ENUM('asap', 'within_a_week', 'flexible');
            CREATE TYPE "buy_request_status_enum" AS ENUM('open', 'fulfilled', 'cancelled');
            CREATE TYPE "buy_request_offer_status_enum" AS ENUM('pending', 'accepted', 'rejected', 'expired', 'withdrawn');
            CREATE TYPE "conversation_type_enum" AS ENUM('listing_inquiry', 'housing_inquiry', 'buy_request_inquiry', 'roommate_inquiry', 'direct_message');
            CREATE TYPE "notification_type_enum" AS ENUM('new_message', 'offer_received', 'offer_accepted', 'offer_rejected', 'offer_countered', 'offer_expired', 'escrow_initiated', 'escrow_confirmed', 'escrow_released', 'escrow_cancelled', 'escrow_disputed', 'review_received', 'listing_favorited', 'listing_sold', 'post_reaction', 'post_comment', 'comment_reply', 'roommate_interest', 'roommate_match', 'verification_approved', 'verification_rejected', 'warning_issued', 'account_banned', 'announcement');
            CREATE TYPE "device_platform_enum" AS ENUM('ios', 'android', 'web');
            CREATE TYPE "post_visibility_enum" AS ENUM('university', 'faculty', 'department');
            CREATE TYPE "reaction_type_enum" AS ENUM('like', 'love', 'laugh', 'wow', 'sad', 'angry');
            CREATE TYPE "article_status_enum" AS ENUM('draft', 'published', 'archived');
            CREATE TYPE "article_category_enum" AS ENUM('news', 'tips', 'announcements', 'campus_life', 'safety', 'events', 'marketplace_tips', 'housing', 'general');
            CREATE TYPE "report_type_enum" AS ENUM('post', 'comment', 'listing', 'user', 'message', 'housing');
            CREATE TYPE "report_reason_enum" AS ENUM('spam', 'harassment', 'hate_speech', 'violence', 'nudity', 'scam', 'fake_listing', 'impersonation', 'misinformation', 'illegal_content', 'underage', 'self_harm', 'other');
            CREATE TYPE "report_status_enum" AS ENUM('pending', 'under_review', 'action_taken', 'dismissed');
            CREATE TYPE "report_action_enum" AS ENUM('none', 'warning_issued', 'content_removed', 'user_banned_temp', 'user_banned_perm');
            CREATE TYPE "moderation_content_type_enum" AS ENUM('post', 'comment', 'listing', 'message', 'profile', 'housing');
            CREATE TYPE "moderation_source_enum" AS ENUM('ai_flag', 'keyword_flag', 'user_report', 'manual');
            CREATE TYPE "moderation_status_enum" AS ENUM('pending', 'in_review', 'approved', 'rejected', 'removed');
            CREATE TYPE "moderation_category_enum" AS ENUM('spam', 'hate_speech', 'harassment', 'violence', 'adult_content', 'scam', 'misinformation', 'personal_info', 'other');
            CREATE TYPE "warning_reason_enum" AS ENUM('spam', 'harassment', 'inappropriate_content', 'policy_violation', 'scam_attempt', 'other');
            CREATE TYPE "ban_appeal_status_enum" AS ENUM('pending', 'under_review', 'approved', 'rejected');
            CREATE TYPE "kyc_type_enum" AS ENUM('bvn', 'nin');
            CREATE TYPE "kyc_status_enum" AS ENUM('pending', 'success', 'failed');
            CREATE TYPE "document_type_enum" AS ENUM('student_id_front', 'student_id_back', 'school_fees_receipt', 'tuition_receipt', 'admission_letter');
            CREATE TYPE "document_status_enum" AS ENUM('pending', 'approved', 'rejected');
        `);

        // Create universities table (no dependencies)
        await queryRunner.query(`
            CREATE TABLE "universities" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" VARCHAR(255) NOT NULL,
                "code" VARCHAR(50) NOT NULL UNIQUE,
                "state" VARCHAR(100),
                "city" VARCHAR(100),
                "address" TEXT,
                "website" VARCHAR(255),
                "type" university_type_enum DEFAULT 'federal',
                "is_active" BOOLEAN DEFAULT true,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now()
            );
            CREATE INDEX "idx_universities_name" ON "universities"("name");
        `);

        // Create faculties table (depends on universities)
        await queryRunner.query(`
            CREATE TABLE "faculties" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" VARCHAR(255) NOT NULL,
                "code" VARCHAR(50),
                "university_id" UUID NOT NULL,
                "is_active" BOOLEAN DEFAULT true,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_faculties_university" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_faculties_university_name" UNIQUE("university_id", "name")
            );
            CREATE INDEX "idx_faculties_university_id" ON "faculties"("university_id");
        `);

        // Create departments table (depends on faculties)
        await queryRunner.query(`
            CREATE TABLE "departments" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "name" VARCHAR(255) NOT NULL,
                "code" VARCHAR(50),
                "faculty_id" UUID NOT NULL,
                "is_active" BOOLEAN DEFAULT true,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_departments_faculty" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_departments_faculty_name" UNIQUE("faculty_id", "name")
            );
            CREATE INDEX "idx_departments_faculty_id" ON "departments"("faculty_id");
        `);

        // Create users table (depends on universities, faculties, departments)
        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "phone" VARCHAR(20) NOT NULL UNIQUE,
                "phone_verified" BOOLEAN DEFAULT false,
                "phone_verified_at" TIMESTAMP,
                "email" VARCHAR(255) NOT NULL UNIQUE,
                "email_verified" BOOLEAN DEFAULT false,
                "email_verified_at" TIMESTAMP,
                "password_hash" VARCHAR(255) NOT NULL,
                "full_name" VARCHAR(255) NOT NULL,
                "profile_photo_url" VARCHAR(500),
                "bio" TEXT,
                "year_of_study" year_of_study_enum,
                "university_id" UUID NOT NULL,
                "faculty_id" UUID NOT NULL,
                "department_id" UUID NOT NULL,
                "verification_tier" verification_tier_enum DEFAULT 'none',
                "school_email" VARCHAR(255),
                "school_email_verified" BOOLEAN DEFAULT false,
                "school_email_verified_at" TIMESTAMP,
                "tier1_review_status" tier1_review_status_enum DEFAULT 'not_submitted',
                "tier1_approved_at" TIMESTAMP,
                "tier1_approved_by" VARCHAR(255),
                "tier1_rejection_count" INTEGER DEFAULT 0,
                "tier1_rejection_reason" TEXT,
                "tier2_verified_at" TIMESTAMP,
                "bvn_verified" BOOLEAN DEFAULT false,
                "nin_verified" BOOLEAN DEFAULT false,
                "kyc_attempt_count" INTEGER DEFAULT 0,
                "is_banned" BOOLEAN DEFAULT false,
                "ban_reason" TEXT,
                "ban_expires_at" TIMESTAMP,
                "banned_at" TIMESTAMP,
                "banned_by" VARCHAR(255),
                "device_id" VARCHAR(255),
                "is_deleted" BOOLEAN DEFAULT false,
                "deleted_at" TIMESTAMP,
                "is_deactivated" BOOLEAN DEFAULT false,
                "scheduled_deletion_at" TIMESTAMP,
                "seller_rating" DECIMAL(3,2) DEFAULT 0,
                "seller_rating_count" INTEGER DEFAULT 0,
                "buyer_rating" DECIMAL(3,2) DEFAULT 0,
                "buyer_rating_count" INTEGER DEFAULT 0,
                "completed_transactions" INTEGER DEFAULT 0,
                "refresh_token_hash" VARCHAR(255),
                "last_login_at" TIMESTAMP,
                "last_active_at" TIMESTAMP,
                "role" user_role_enum DEFAULT 'user',
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_users_university" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_users_faculty" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE RESTRICT,
                CONSTRAINT "fk_users_department" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT
            );
            CREATE INDEX "idx_users_phone" ON "users"("phone");
            CREATE INDEX "idx_users_email" ON "users"("email");
            CREATE INDEX "idx_users_university_id" ON "users"("university_id");
            CREATE INDEX "idx_users_verification_tier" ON "users"("verification_tier");
            CREATE INDEX "idx_users_tier1_review_status" ON "users"("tier1_review_status");
            CREATE INDEX "idx_users_is_banned" ON "users"("is_banned");
            CREATE INDEX "idx_users_device_id" ON "users"("device_id");
            CREATE INDEX "idx_users_is_deleted" ON "users"("is_deleted");
            CREATE INDEX "idx_users_scheduled_deletion_at" ON "users"("scheduled_deletion_at");
        `);

        // Create email_verifications table
        await queryRunner.query(`
            CREATE TABLE "email_verifications" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "email" VARCHAR(255) NOT NULL,
                "type" email_verification_type_enum NOT NULL,
                "token" VARCHAR(255) NOT NULL UNIQUE,
                "expires_at" TIMESTAMP NOT NULL,
                "verified_at" TIMESTAMP,
                "resend_count" INTEGER DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_email_verifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_email_verifications_user_type" ON "email_verifications"("user_id", "type");
            CREATE INDEX "idx_email_verifications_token" ON "email_verifications"("token");
        `);

        // Create password_resets table
        await queryRunner.query(`
            CREATE TABLE "password_resets" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "email" VARCHAR(255) NOT NULL,
                "token" VARCHAR(255) NOT NULL UNIQUE,
                "expires_at" TIMESTAMP NOT NULL,
                "used_at" TIMESTAMP,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_password_resets_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_password_resets_token" ON "password_resets"("token");
            CREATE INDEX "idx_password_resets_user_id" ON "password_resets"("user_id");
        `);

        // Create wallets table
        await queryRunner.query(`
            CREATE TABLE "wallets" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL UNIQUE,
                "balance" DECIMAL(12,2) DEFAULT 0,
                "locked_balance" DECIMAL(12,2) DEFAULT 0,
                "is_locked" BOOLEAN DEFAULT false,
                "lock_reason" TEXT,
                "locked_at" TIMESTAMP,
                "bank_account_number" VARCHAR(20),
                "bank_code" VARCHAR(20),
                "bank_name" VARCHAR(100),
                "bank_account_name" VARCHAR(255),
                "paystack_recipient_code" VARCHAR(100),
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_wallets_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_wallets_user_id" ON "wallets"("user_id");
        `);

        // Create wallet_transactions table
        await queryRunner.query(`
            CREATE TABLE "wallet_transactions" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "wallet_id" UUID NOT NULL,
                "type" wallet_transaction_type_enum NOT NULL,
                "amount" DECIMAL(12,2) NOT NULL,
                "status" wallet_transaction_status_enum DEFAULT 'pending',
                "reference" VARCHAR(100) NOT NULL UNIQUE,
                "description" TEXT,
                "external_reference" VARCHAR(255),
                "metadata" JSONB,
                "balance_before" DECIMAL(12,2),
                "balance_after" DECIMAL(12,2),
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_wallet_transactions_wallet" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_wallet_transactions_wallet_created" ON "wallet_transactions"("wallet_id", "created_at");
            CREATE INDEX "idx_wallet_transactions_wallet_id" ON "wallet_transactions"("wallet_id");
            CREATE INDEX "idx_wallet_transactions_reference" ON "wallet_transactions"("reference");
        `);

        // Create listings table
        await queryRunner.query(`
            CREATE TABLE "listings" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "seller_id" UUID NOT NULL,
                "university_id" UUID NOT NULL,
                "type" listing_type_enum DEFAULT 'sell',
                "title" VARCHAR(255) NOT NULL,
                "description" TEXT NOT NULL,
                "category" listing_category_enum NOT NULL,
                "condition" listing_condition_enum NOT NULL,
                "price" DECIMAL(12,2) NOT NULL,
                "is_negotiable" BOOLEAN DEFAULT true,
                "visibility_scope" visibility_scope_enum DEFAULT 'university',
                "faculty_id" UUID,
                "department_id" UUID,
                "delivery_option" delivery_option_enum DEFAULT 'meetup',
                "meetup_location" TEXT,
                "status" listing_status_enum DEFAULT 'active',
                "view_count" INTEGER DEFAULT 0,
                "favorite_count" INTEGER DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_listings_seller" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_listings_university" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_listings_faculty" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_listings_department" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_listings_university_status_created" ON "listings"("university_id", "status", "created_at");
            CREATE INDEX "idx_listings_university_category_status" ON "listings"("university_id", "category", "status");
            CREATE INDEX "idx_listings_seller_status" ON "listings"("seller_id", "status");
            CREATE INDEX "idx_listings_seller_id" ON "listings"("seller_id");
            CREATE INDEX "idx_listings_university_id" ON "listings"("university_id");
            CREATE INDEX "idx_listings_category" ON "listings"("category");
            CREATE INDEX "idx_listings_status" ON "listings"("status");
        `);

        // Create listing_images table
        await queryRunner.query(`
            CREATE TABLE "listing_images" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "listing_id" UUID NOT NULL,
                "url" VARCHAR(500) NOT NULL,
                "position" INTEGER DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_listing_images_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_listing_images_listing_position" ON "listing_images"("listing_id", "position");
            CREATE INDEX "idx_listing_images_listing_id" ON "listing_images"("listing_id");
        `);

        // Create offers table
        await queryRunner.query(`
            CREATE TABLE "offers" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "listing_id" UUID NOT NULL,
                "buyer_id" UUID NOT NULL,
                "seller_id" UUID NOT NULL,
                "amount" DECIMAL(12,2) NOT NULL,
                "status" offer_status_enum DEFAULT 'pending',
                "message" TEXT,
                "counter_amount" DECIMAL(12,2),
                "counter_message" TEXT,
                "responded_at" TIMESTAMP,
                "expires_at" TIMESTAMP NOT NULL,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_offers_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_offers_buyer" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_offers_seller" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_offers_listing_status_created" ON "offers"("listing_id", "status", "created_at");
            CREATE INDEX "idx_offers_buyer_status" ON "offers"("buyer_id", "status");
            CREATE INDEX "idx_offers_listing_id" ON "offers"("listing_id");
            CREATE INDEX "idx_offers_buyer_id" ON "offers"("buyer_id");
        `);

        // Create favorites table
        await queryRunner.query(`
            CREATE TABLE "favorites" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "listing_id" UUID NOT NULL,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_favorites_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_favorites_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_favorites_user_listing" UNIQUE("user_id", "listing_id")
            );
            CREATE INDEX "idx_favorites_user_created" ON "favorites"("user_id", "created_at");
            CREATE INDEX "idx_favorites_user_id" ON "favorites"("user_id");
            CREATE INDEX "idx_favorites_listing_id" ON "favorites"("listing_id");
        `);

        // Create escrow_transactions table
        await queryRunner.query(`
            CREATE TABLE "escrow_transactions" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "buyer_id" UUID NOT NULL,
                "seller_id" UUID NOT NULL,
                "listing_id" UUID NOT NULL,
                "offer_id" UUID,
                "amount" DECIMAL(12,2) NOT NULL,
                "fee" DECIMAL(12,2) NOT NULL,
                "total_amount" DECIMAL(12,2) NOT NULL,
                "status" escrow_status_enum DEFAULT 'pending',
                "buyer_confirmed_at" TIMESTAMP,
                "seller_confirmed_at" TIMESTAMP,
                "released_at" TIMESTAMP,
                "refunded_at" TIMESTAMP,
                "expires_at" TIMESTAMP NOT NULL,
                "notes" TEXT,
                "metadata" JSONB,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_escrow_transactions_buyer" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_escrow_transactions_seller" FOREIGN KEY ("seller_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_escrow_transactions_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_escrow_transactions_offer" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_escrow_transactions_status_created" ON "escrow_transactions"("status", "created_at");
            CREATE INDEX "idx_escrow_transactions_buyer_status" ON "escrow_transactions"("buyer_id", "status");
            CREATE INDEX "idx_escrow_transactions_seller_status" ON "escrow_transactions"("seller_id", "status");
            CREATE INDEX "idx_escrow_transactions_buyer_id" ON "escrow_transactions"("buyer_id");
            CREATE INDEX "idx_escrow_transactions_seller_id" ON "escrow_transactions"("seller_id");
            CREATE INDEX "idx_escrow_transactions_listing_id" ON "escrow_transactions"("listing_id");
        `);

        // Create disputes table
        await queryRunner.query(`
            CREATE TABLE "disputes" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "escrow_id" UUID NOT NULL,
                "opened_by_id" UUID NOT NULL,
                "reason" dispute_reason_enum NOT NULL,
                "description" TEXT NOT NULL,
                "evidence" JSONB,
                "status" dispute_status_enum DEFAULT 'open',
                "resolved_by_id" UUID,
                "resolution" TEXT,
                "buyer_refund_amount" DECIMAL(12,2),
                "seller_release_amount" DECIMAL(12,2),
                "resolved_at" TIMESTAMP,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_disputes_escrow" FOREIGN KEY ("escrow_id") REFERENCES "escrow_transactions"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_disputes_opened_by" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_disputes_resolved_by" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_disputes_status_created" ON "disputes"("status", "created_at");
            CREATE INDEX "idx_disputes_escrow_id" ON "disputes"("escrow_id");
        `);

        // Create reviews table
        await queryRunner.query(`
            CREATE TABLE "reviews" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "transaction_id" UUID NOT NULL,
                "reviewer_id" UUID NOT NULL,
                "reviewee_id" UUID NOT NULL,
                "type" review_type_enum NOT NULL,
                "rating" SMALLINT NOT NULL CHECK ("rating" >= 1 AND "rating" <= 5),
                "comment" TEXT,
                "is_edited" BOOLEAN DEFAULT false,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_reviews_reviewer" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_reviews_reviewee" FOREIGN KEY ("reviewee_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_reviews_transaction_reviewer_type" UNIQUE("transaction_id", "reviewer_id", "type")
            );
            CREATE INDEX "idx_reviews_transaction_id" ON "reviews"("transaction_id");
            CREATE INDEX "idx_reviews_reviewer_id" ON "reviews"("reviewer_id");
            CREATE INDEX "idx_reviews_reviewee_type_created" ON "reviews"("reviewee_id", "type", "created_at");
        `);

        // Create housing_listings table
        await queryRunner.query(`
            CREATE TABLE "housing_listings" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "landlord_id" UUID NOT NULL,
                "university_id" UUID NOT NULL,
                "title" VARCHAR(255) NOT NULL,
                "description" TEXT NOT NULL,
                "type" housing_type_enum NOT NULL,
                "status" housing_status_enum DEFAULT 'available',
                "price" DECIMAL(12,2) NOT NULL,
                "payment_frequency" payment_frequency_enum NOT NULL,
                "caution_fee" DECIMAL(12,2),
                "agent_fee" DECIMAL(12,2),
                "address" VARCHAR(500) NOT NULL,
                "area" VARCHAR(255) NOT NULL,
                "latitude" DECIMAL(10,7),
                "longitude" DECIMAL(10,7),
                "bedrooms" INTEGER DEFAULT 1,
                "bathrooms" INTEGER DEFAULT 1,
                "furnishing" furnishing_status_enum DEFAULT 'unfurnished',
                "gender_preference" gender_preference_enum DEFAULT 'any',
                "has_water" BOOLEAN DEFAULT false,
                "has_electricity" BOOLEAN DEFAULT false,
                "has_internet" BOOLEAN DEFAULT false,
                "has_parking" BOOLEAN DEFAULT false,
                "has_security_guard" BOOLEAN DEFAULT false,
                "has_generator" BOOLEAN DEFAULT false,
                "has_prepaid_meter" BOOLEAN DEFAULT false,
                "is_gated" BOOLEAN DEFAULT false,
                "allows_pets" BOOLEAN DEFAULT false,
                "other_amenities" JSONB,
                "image_urls" JSONB DEFAULT '[]',
                "video_url" JSONB,
                "rules" TEXT,
                "available_from" DATE,
                "view_count" INTEGER DEFAULT 0,
                "inquiry_count" INTEGER DEFAULT 0,
                "is_verified" BOOLEAN DEFAULT false,
                "verified_at" TIMESTAMP,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_housing_listings_landlord" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_housing_listings_university" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_housing_listings_university_status_created" ON "housing_listings"("university_id", "status", "created_at");
            CREATE INDEX "idx_housing_listings_university_type_status" ON "housing_listings"("university_id", "type", "status");
            CREATE INDEX "idx_housing_listings_landlord_status" ON "housing_listings"("landlord_id", "status");
            CREATE INDEX "idx_housing_listings_price_status" ON "housing_listings"("price", "status");
        `);

        // Create roommate_profiles table
        await queryRunner.query(`
            CREATE TABLE "roommate_profiles" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL UNIQUE,
                "university_id" UUID NOT NULL,
                "status" roommate_profile_status_enum DEFAULT 'active',
                "gender" gender_enum NOT NULL,
                "age" INTEGER NOT NULL,
                "bio" TEXT,
                "budget_min" DECIMAL(12,2) NOT NULL,
                "budget_max" DECIMAL(12,2) NOT NULL,
                "preferred_areas" JSONB DEFAULT '[]',
                "move_in_date" DATE,
                "move_in_flexible" BOOLEAN DEFAULT false,
                "cleanliness" cleanliness_level_enum DEFAULT 'clean',
                "noise_level" noise_level_enum DEFAULT 'moderate',
                "sleep_schedule" sleep_schedule_enum DEFAULT 'normal',
                "study_habit" study_habit_enum DEFAULT 'flexible',
                "smokes" BOOLEAN DEFAULT false,
                "drinks" BOOLEAN DEFAULT false,
                "has_pets" BOOLEAN DEFAULT false,
                "allows_visitors" BOOLEAN DEFAULT false,
                "preferred_gender" gender_enum,
                "preferred_age_min" INTEGER,
                "preferred_age_max" INTEGER,
                "preferred_cleanliness" cleanliness_level_enum,
                "preferred_noise_level" noise_level_enum,
                "preferred_sleep_schedule" sleep_schedule_enum,
                "non_smoker_only" BOOLEAN DEFAULT false,
                "non_drinker_only" BOOLEAN DEFAULT false,
                "no_pets_allowed" BOOLEAN DEFAULT false,
                "interests" JSONB,
                "languages" JSONB,
                "view_count" INTEGER DEFAULT 0,
                "interest_received_count" INTEGER DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_roommate_profiles_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_roommate_profiles_university" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_roommate_profiles_university_status" ON "roommate_profiles"("university_id", "status");
            CREATE INDEX "idx_roommate_profiles_gender_status" ON "roommate_profiles"("gender", "status");
            CREATE INDEX "idx_roommate_profiles_budget" ON "roommate_profiles"("budget_min", "budget_max");
            CREATE INDEX "idx_roommate_profiles_user_id" ON "roommate_profiles"("user_id");
        `);

        // Create roommate_interests table
        await queryRunner.query(`
            CREATE TABLE "roommate_interests" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "from_user_id" UUID NOT NULL,
                "to_user_id" UUID NOT NULL,
                "status" roommate_interest_status_enum DEFAULT 'pending',
                "message" TEXT,
                "compatibility_score" DECIMAL(5,2),
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_roommate_interests_from_user" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_roommate_interests_to_user" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_roommate_interests_from_to" UNIQUE("from_user_id", "to_user_id")
            );
            CREATE INDEX "idx_roommate_interests_from_user_id" ON "roommate_interests"("from_user_id");
            CREATE INDEX "idx_roommate_interests_to_status" ON "roommate_interests"("to_user_id", "status");
        `);

        // Create buy_requests table
        await queryRunner.query(`
            CREATE TABLE "buy_requests" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "requester_id" UUID NOT NULL,
                "university_id" UUID NOT NULL,
                "title" VARCHAR(255) NOT NULL,
                "description" TEXT NOT NULL,
                "category" listing_category_enum NOT NULL,
                "budget_min" DECIMAL(12,2) NOT NULL,
                "budget_max" DECIMAL(12,2),
                "is_budget_negotiable" BOOLEAN DEFAULT true,
                "urgency" request_urgency_enum DEFAULT 'flexible',
                "visibility_scope" visibility_scope_enum DEFAULT 'university',
                "faculty_id" UUID,
                "department_id" UUID,
                "status" buy_request_status_enum DEFAULT 'open',
                "view_count" INTEGER DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_buy_requests_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_buy_requests_university" FOREIGN KEY ("university_id") REFERENCES "universities"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_buy_requests_faculty" FOREIGN KEY ("faculty_id") REFERENCES "faculties"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_buy_requests_department" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_buy_requests_university_status_created" ON "buy_requests"("university_id", "status", "created_at");
            CREATE INDEX "idx_buy_requests_university_category_status" ON "buy_requests"("university_id", "category", "status");
            CREATE INDEX "idx_buy_requests_requester_status" ON "buy_requests"("requester_id", "status");
            CREATE INDEX "idx_buy_requests_requester_id" ON "buy_requests"("requester_id");
            CREATE INDEX "idx_buy_requests_university_id" ON "buy_requests"("university_id");
            CREATE INDEX "idx_buy_requests_category" ON "buy_requests"("category");
            CREATE INDEX "idx_buy_requests_status" ON "buy_requests"("status");
        `);

        // Create conversations table
        await queryRunner.query(`
            CREATE TABLE "conversations" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "type" conversation_type_enum DEFAULT 'listing_inquiry',
                "listing_id" UUID,
                "housing_listing_id" UUID,
                "buy_request_id" UUID,
                "roommate_profile_id" UUID,
                "buyer_id" UUID,
                "participant1_id" UUID NOT NULL,
                "participant2_id" UUID NOT NULL,
                "last_message_preview" TEXT,
                "last_message_at" TIMESTAMP,
                "last_message_sender_id" UUID,
                "participant1_unread_count" INTEGER DEFAULT 0,
                "participant2_unread_count" INTEGER DEFAULT 0,
                "is_deleted_by_participant1" BOOLEAN DEFAULT false,
                "is_deleted_by_participant2" BOOLEAN DEFAULT false,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_conversations_participant1" FOREIGN KEY ("participant1_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_conversations_participant2" FOREIGN KEY ("participant2_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_conversations_listing" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_conversations_housing_listing" FOREIGN KEY ("housing_listing_id") REFERENCES "housing_listings"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_conversations_buy_request" FOREIGN KEY ("buy_request_id") REFERENCES "buy_requests"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_conversations_roommate_profile" FOREIGN KEY ("roommate_profile_id") REFERENCES "roommate_profiles"("id") ON DELETE SET NULL,
                CONSTRAINT "uq_conversations_listing_buyer" UNIQUE("listing_id", "buyer_id"),
                CONSTRAINT "uq_conversations_housing_buyer" UNIQUE("housing_listing_id", "buyer_id"),
                CONSTRAINT "uq_conversations_buy_request_buyer" UNIQUE("buy_request_id", "buyer_id"),
                CONSTRAINT "uq_conversations_roommate_buyer" UNIQUE("roommate_profile_id", "buyer_id")
            );
            CREATE INDEX "idx_conversations_participant1_updated" ON "conversations"("participant1_id", "updated_at");
            CREATE INDEX "idx_conversations_participant2_updated" ON "conversations"("participant2_id", "updated_at");
            CREATE INDEX "idx_conversations_listing_id" ON "conversations"("listing_id");
            CREATE INDEX "idx_conversations_housing_listing_id" ON "conversations"("housing_listing_id");
            CREATE INDEX "idx_conversations_buy_request_id" ON "conversations"("buy_request_id");
            CREATE INDEX "idx_conversations_roommate_profile_id" ON "conversations"("roommate_profile_id");
        `);

        // Create buy_request_offers table
        await queryRunner.query(`
            CREATE TABLE "buy_request_offers" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "buy_request_id" UUID NOT NULL,
                "responder_id" UUID NOT NULL,
                "requester_id" UUID NOT NULL,
                "proposed_price" DECIMAL(12,2) NOT NULL,
                "item_condition" listing_condition_enum NOT NULL,
                "message" TEXT,
                "image_url" VARCHAR(500),
                "status" buy_request_offer_status_enum DEFAULT 'pending',
                "expires_at" TIMESTAMP NOT NULL,
                "responded_at" TIMESTAMP,
                "conversation_id" UUID,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_buy_request_offers_buy_request" FOREIGN KEY ("buy_request_id") REFERENCES "buy_requests"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_buy_request_offers_responder" FOREIGN KEY ("responder_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_buy_request_offers_requester" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_buy_request_offers_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_buy_request_offers_request_status_created" ON "buy_request_offers"("buy_request_id", "status", "created_at");
            CREATE INDEX "idx_buy_request_offers_responder_status" ON "buy_request_offers"("responder_id", "status");
            CREATE INDEX "idx_buy_request_offers_requester_status" ON "buy_request_offers"("requester_id", "status");
        `);

        // Create messages table
        await queryRunner.query(`
            CREATE TABLE "messages" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "conversation_id" UUID NOT NULL,
                "sender_id" UUID NOT NULL,
                "content" TEXT NOT NULL,
                "attachments" JSONB,
                "is_read" BOOLEAN DEFAULT false,
                "read_at" TIMESTAMP,
                "is_system_message" BOOLEAN DEFAULT false,
                "metadata" JSONB,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_messages_sender" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_messages_conversation_created" ON "messages"("conversation_id", "created_at");
            CREATE INDEX "idx_messages_conversation_id" ON "messages"("conversation_id");
            CREATE INDEX "idx_messages_sender_id" ON "messages"("sender_id");
        `);

        // Create notifications table
        await queryRunner.query(`
            CREATE TABLE "notifications" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "type" notification_type_enum NOT NULL,
                "title" VARCHAR(255) NOT NULL,
                "body" TEXT NOT NULL,
                "data" JSONB,
                "image_url" VARCHAR(500),
                "is_read" BOOLEAN DEFAULT false,
                "read_at" TIMESTAMP,
                "push_sent" BOOLEAN DEFAULT false,
                "push_sent_at" TIMESTAMP,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_notifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_notifications_user_read_created" ON "notifications"("user_id", "is_read", "created_at");
            CREATE INDEX "idx_notifications_user_created" ON "notifications"("user_id", "created_at");
            CREATE INDEX "idx_notifications_user_id" ON "notifications"("user_id");
            CREATE INDEX "idx_notifications_type" ON "notifications"("type");
        `);

        // Create notification_preferences table
        await queryRunner.query(`
            CREATE TABLE "notification_preferences" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL UNIQUE,
                "push_enabled" BOOLEAN DEFAULT true,
                "email_enabled" BOOLEAN DEFAULT true,
                "messages_enabled" BOOLEAN DEFAULT true,
                "offers_enabled" BOOLEAN DEFAULT true,
                "escrow_enabled" BOOLEAN DEFAULT true,
                "reviews_enabled" BOOLEAN DEFAULT true,
                "social_enabled" BOOLEAN DEFAULT true,
                "housing_enabled" BOOLEAN DEFAULT true,
                "announcements_enabled" BOOLEAN DEFAULT true,
                "quiet_hours_enabled" BOOLEAN DEFAULT false,
                "quiet_hours_start" TIME,
                "quiet_hours_end" TIME,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_notification_preferences_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_notification_preferences_user_id" ON "notification_preferences"("user_id");
        `);

        // Create fcm_tokens table
        await queryRunner.query(`
            CREATE TABLE "fcm_tokens" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "token" VARCHAR(500) NOT NULL UNIQUE,
                "platform" device_platform_enum NOT NULL,
                "device_id" VARCHAR(255),
                "device_name" VARCHAR(100),
                "is_active" BOOLEAN DEFAULT true,
                "last_used_at" TIMESTAMP,
                "failure_count" INTEGER DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_fcm_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_fcm_tokens_user_active" ON "fcm_tokens"("user_id", "is_active");
            CREATE INDEX "idx_fcm_tokens_token" ON "fcm_tokens"("token");
            CREATE INDEX "idx_fcm_tokens_is_active" ON "fcm_tokens"("is_active");
        `);

        // Create posts table
        await queryRunner.query(`
            CREATE TABLE "posts" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "author_id" UUID NOT NULL,
                "anonymous_id" UUID NOT NULL,
                "university_id" UUID NOT NULL,
                "faculty_id" UUID,
                "department_id" UUID,
                "visibility" post_visibility_enum DEFAULT 'university',
                "content" TEXT NOT NULL,
                "image_urls" JSONB DEFAULT '[]',
                "poll" JSONB,
                "reactions" JSONB DEFAULT '[]',
                "total_reactions" INTEGER DEFAULT 0,
                "comment_count" INTEGER DEFAULT 0,
                "view_count" INTEGER DEFAULT 0,
                "is_edited" BOOLEAN DEFAULT false,
                "is_deleted" BOOLEAN DEFAULT false,
                "is_hidden" BOOLEAN DEFAULT false,
                "hidden_reason" TEXT,
                "report_count" INTEGER DEFAULT 0,
                "engagement_score" DECIMAL(12,4) DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now()
            );
            CREATE INDEX "idx_posts_university_created" ON "posts"("university_id", "created_at");
            CREATE INDEX "idx_posts_university_visibility_created" ON "posts"("university_id", "visibility", "created_at");
            CREATE INDEX "idx_posts_university_engagement" ON "posts"("university_id", "engagement_score");
            CREATE INDEX "idx_posts_author_created" ON "posts"("author_id", "created_at");
            CREATE INDEX "idx_posts_is_deleted" ON "posts"("is_deleted");
        `);

        // Create comments table
        await queryRunner.query(`
            CREATE TABLE "comments" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "post_id" UUID NOT NULL,
                "parent_id" UUID,
                "author_id" UUID NOT NULL,
                "anonymous_id" UUID NOT NULL,
                "content" TEXT NOT NULL,
                "reactions" JSONB DEFAULT '[]',
                "total_reactions" INTEGER DEFAULT 0,
                "reply_count" INTEGER DEFAULT 0,
                "depth" INTEGER DEFAULT 0,
                "is_edited" BOOLEAN DEFAULT false,
                "is_deleted" BOOLEAN DEFAULT false,
                "is_hidden" BOOLEAN DEFAULT false,
                "hidden_reason" TEXT,
                "report_count" INTEGER DEFAULT 0,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_comments_post" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_comments_parent" FOREIGN KEY ("parent_id") REFERENCES "comments"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_comments_post_created" ON "comments"("post_id", "created_at");
            CREATE INDEX "idx_comments_post_parent_created" ON "comments"("post_id", "parent_id", "created_at");
            CREATE INDEX "idx_comments_author_created" ON "comments"("author_id", "created_at");
            CREATE INDEX "idx_comments_is_deleted" ON "comments"("is_deleted");
        `);

        // Create articles table
        await queryRunner.query(`
            CREATE TABLE "articles" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "title" VARCHAR(255) NOT NULL,
                "slug" VARCHAR(300) NOT NULL UNIQUE,
                "excerpt" TEXT,
                "content" TEXT NOT NULL,
                "cover_image_url" VARCHAR(500),
                "category" article_category_enum DEFAULT 'general',
                "tags" JSONB,
                "status" article_status_enum DEFAULT 'draft',
                "is_featured" BOOLEAN DEFAULT false,
                "author_id" UUID,
                "view_count" INTEGER DEFAULT 0,
                "bookmark_count" INTEGER DEFAULT 0,
                "published_at" TIMESTAMP,
                "meta_description" VARCHAR(160),
                "meta_keywords" JSONB,
                "reading_time" INTEGER DEFAULT 1,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_articles_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_articles_status_published" ON "articles"("status", "published_at");
            CREATE INDEX "idx_articles_category_status" ON "articles"("category", "status");
            CREATE INDEX "idx_articles_slug" ON "articles"("slug");
            CREATE INDEX "idx_articles_status" ON "articles"("status");
            CREATE INDEX "idx_articles_category" ON "articles"("category");
            CREATE INDEX "idx_articles_is_featured" ON "articles"("is_featured");
        `);

        // Create article_bookmarks table
        await queryRunner.query(`
            CREATE TABLE "article_bookmarks" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "article_id" UUID NOT NULL,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_article_bookmarks_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_article_bookmarks_article" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE,
                CONSTRAINT "uq_article_bookmarks_user_article" UNIQUE("user_id", "article_id")
            );
            CREATE INDEX "idx_article_bookmarks_user_created" ON "article_bookmarks"("user_id", "created_at");
            CREATE INDEX "idx_article_bookmarks_user_id" ON "article_bookmarks"("user_id");
            CREATE INDEX "idx_article_bookmarks_article_id" ON "article_bookmarks"("article_id");
        `);

        // Create reports table
        await queryRunner.query(`
            CREATE TABLE "reports" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "reporter_id" UUID NOT NULL,
                "type" report_type_enum NOT NULL,
                "target_id" UUID NOT NULL,
                "reported_user_id" UUID,
                "reason" report_reason_enum NOT NULL,
                "description" TEXT,
                "evidence" JSONB,
                "status" report_status_enum DEFAULT 'pending',
                "action" report_action_enum,
                "reviewed_by_id" UUID,
                "review_notes" TEXT,
                "reviewed_at" TIMESTAMP,
                "priority" INTEGER DEFAULT 0,
                "report_count" INTEGER DEFAULT 1,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_reports_reporter" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_reports_reported_user" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_reports_reviewed_by" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_reports_status_created" ON "reports"("status", "created_at");
            CREATE INDEX "idx_reports_type_target" ON "reports"("type", "target_id");
            CREATE INDEX "idx_reports_reporter_id" ON "reports"("reporter_id");
            CREATE INDEX "idx_reports_target_id" ON "reports"("target_id");
            CREATE INDEX "idx_reports_reported_user_id" ON "reports"("reported_user_id");
            CREATE INDEX "idx_reports_priority" ON "reports"("priority");
        `);

        // Create moderation_queue table
        await queryRunner.query(`
            CREATE TABLE "moderation_queue" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "content_type" moderation_content_type_enum NOT NULL,
                "content_id" UUID NOT NULL,
                "user_id" UUID NOT NULL,
                "source" moderation_source_enum NOT NULL,
                "category" moderation_category_enum,
                "ai_score" DECIMAL(5,4),
                "ai_details" JSONB,
                "flagged_keywords" JSONB,
                "content_snapshot" TEXT,
                "status" moderation_status_enum DEFAULT 'pending',
                "priority" INTEGER DEFAULT 50,
                "reviewed_by_id" UUID,
                "review_notes" TEXT,
                "reviewed_at" TIMESTAMP,
                "action_taken" TEXT,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_moderation_queue_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_moderation_queue_reviewed_by" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_moderation_queue_status_priority_created" ON "moderation_queue"("status", "priority", "created_at");
            CREATE INDEX "idx_moderation_queue_content_type_id" ON "moderation_queue"("content_type", "content_id");
            CREATE INDEX "idx_moderation_queue_content_id" ON "moderation_queue"("content_id");
            CREATE INDEX "idx_moderation_queue_user_id" ON "moderation_queue"("user_id");
        `);

        // Create warnings table
        await queryRunner.query(`
            CREATE TABLE "warnings" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "issued_by_id" UUID,
                "reason" warning_reason_enum NOT NULL,
                "message" TEXT NOT NULL,
                "report_id" UUID,
                "acknowledged" BOOLEAN DEFAULT false,
                "acknowledged_at" TIMESTAMP,
                "expires_at" TIMESTAMP,
                "is_active" BOOLEAN DEFAULT true,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_warnings_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_warnings_issued_by" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL,
                CONSTRAINT "fk_warnings_report" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_warnings_user_created" ON "warnings"("user_id", "created_at");
        `);

        // Create ban_appeals table
        await queryRunner.query(`
            CREATE TABLE "ban_appeals" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "reason" TEXT NOT NULL,
                "evidence" JSONB,
                "status" ban_appeal_status_enum DEFAULT 'pending',
                "reviewed_by_id" UUID,
                "review_notes" TEXT,
                "reviewed_at" TIMESTAMP,
                "original_ban_reason" TEXT,
                "original_ban_date" TIMESTAMP,
                "original_ban_expiry" TIMESTAMP,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_ban_appeals_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "fk_ban_appeals_reviewed_by" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL
            );
            CREATE INDEX "idx_ban_appeals_status_created" ON "ban_appeals"("status", "created_at");
            CREATE INDEX "idx_ban_appeals_user_id" ON "ban_appeals"("user_id");
        `);

        // Create kyc_verifications table
        await queryRunner.query(`
            CREATE TABLE "kyc_verifications" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "type" kyc_type_enum NOT NULL,
                "status" kyc_status_enum DEFAULT 'pending',
                "youverify_reference" VARCHAR(255),
                "attempt_number" INTEGER DEFAULT 1,
                "failure_reason" TEXT,
                "verified_at" TIMESTAMP,
                "metadata" JSONB,
                "created_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_kyc_verifications_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_kyc_verifications_user_type" ON "kyc_verifications"("user_id", "type");
            CREATE INDEX "idx_kyc_verifications_user_id" ON "kyc_verifications"("user_id");
            CREATE INDEX "idx_kyc_verifications_status" ON "kyc_verifications"("status");
        `);

        // Create verification_documents table
        await queryRunner.query(`
            CREATE TABLE "verification_documents" (
                "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                "user_id" UUID NOT NULL,
                "type" document_type_enum NOT NULL,
                "document_url" VARCHAR(500) NOT NULL,
                "status" document_status_enum DEFAULT 'pending',
                "rejection_reason" TEXT,
                "reviewed_at" TIMESTAMP,
                "reviewed_by" VARCHAR(255),
                "metadata" JSONB,
                "submission_attempt" INTEGER DEFAULT 1,
                "created_at" TIMESTAMP DEFAULT now(),
                "updated_at" TIMESTAMP DEFAULT now(),
                CONSTRAINT "fk_verification_documents_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            );
            CREATE INDEX "idx_verification_documents_user_type" ON "verification_documents"("user_id", "type");
            CREATE INDEX "idx_verification_documents_user_id" ON "verification_documents"("user_id");
            CREATE INDEX "idx_verification_documents_status" ON "verification_documents"("status");
        `);

        // Enable UUID extension if not already enabled
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop all tables in reverse order of creation
        await queryRunner.query(`DROP TABLE IF EXISTS "verification_documents" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "kyc_verifications" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "ban_appeals" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "warnings" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "moderation_queue" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "reports" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "article_bookmarks" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "articles" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "comments" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "posts" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "fcm_tokens" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "notifications" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "messages" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "buy_request_offers" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "conversations" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "buy_requests" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "roommate_interests" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "roommate_profiles" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "housing_listings" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "reviews" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "disputes" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "escrow_transactions" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "favorites" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "offers" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "listing_images" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "listings" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallet_transactions" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallets" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "password_resets" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "email_verifications" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "departments" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "faculties" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "universities" CASCADE;`);

        // Drop all enums
        await queryRunner.query(`
            DROP TYPE IF EXISTS "document_status_enum";
            DROP TYPE IF EXISTS "document_type_enum";
            DROP TYPE IF EXISTS "kyc_status_enum";
            DROP TYPE IF EXISTS "kyc_type_enum";
            DROP TYPE IF EXISTS "ban_appeal_status_enum";
            DROP TYPE IF EXISTS "warning_reason_enum";
            DROP TYPE IF EXISTS "moderation_category_enum";
            DROP TYPE IF EXISTS "moderation_status_enum";
            DROP TYPE IF EXISTS "moderation_source_enum";
            DROP TYPE IF EXISTS "moderation_content_type_enum";
            DROP TYPE IF EXISTS "report_action_enum";
            DROP TYPE IF EXISTS "report_status_enum";
            DROP TYPE IF EXISTS "report_reason_enum";
            DROP TYPE IF EXISTS "report_type_enum";
            DROP TYPE IF EXISTS "article_category_enum";
            DROP TYPE IF EXISTS "article_status_enum";
            DROP TYPE IF EXISTS "reaction_type_enum";
            DROP TYPE IF EXISTS "post_visibility_enum";
            DROP TYPE IF EXISTS "device_platform_enum";
            DROP TYPE IF EXISTS "notification_type_enum";
            DROP TYPE IF EXISTS "conversation_type_enum";
            DROP TYPE IF EXISTS "buy_request_offer_status_enum";
            DROP TYPE IF EXISTS "buy_request_status_enum";
            DROP TYPE IF EXISTS "request_urgency_enum";
            DROP TYPE IF EXISTS "roommate_interest_status_enum";
            DROP TYPE IF EXISTS "roommate_profile_status_enum";
            DROP TYPE IF EXISTS "study_habit_enum";
            DROP TYPE IF EXISTS "sleep_schedule_enum";
            DROP TYPE IF EXISTS "noise_level_enum";
            DROP TYPE IF EXISTS "cleanliness_level_enum";
            DROP TYPE IF EXISTS "gender_enum";
            DROP TYPE IF EXISTS "payment_frequency_enum";
            DROP TYPE IF EXISTS "gender_preference_enum";
            DROP TYPE IF EXISTS "furnishing_status_enum";
            DROP TYPE IF EXISTS "housing_status_enum";
            DROP TYPE IF EXISTS "housing_type_enum";
            DROP TYPE IF EXISTS "review_type_enum";
            DROP TYPE IF EXISTS "dispute_reason_enum";
            DROP TYPE IF EXISTS "dispute_status_enum";
            DROP TYPE IF EXISTS "escrow_status_enum";
            DROP TYPE IF EXISTS "offer_status_enum";
            DROP TYPE IF EXISTS "listing_status_enum";
            DROP TYPE IF EXISTS "delivery_option_enum";
            DROP TYPE IF EXISTS "visibility_scope_enum";
            DROP TYPE IF EXISTS "listing_condition_enum";
            DROP TYPE IF EXISTS "listing_category_enum";
            DROP TYPE IF EXISTS "listing_type_enum";
            DROP TYPE IF EXISTS "wallet_transaction_status_enum";
            DROP TYPE IF EXISTS "wallet_transaction_type_enum";
            DROP TYPE IF EXISTS "email_verification_type_enum";
            DROP TYPE IF EXISTS "university_type_enum";
            DROP TYPE IF EXISTS "year_of_study_enum";
            DROP TYPE IF EXISTS "user_role_enum";
            DROP TYPE IF EXISTS "tier1_review_status_enum";
            DROP TYPE IF EXISTS "verification_tier_enum";
        `);
    }
}
