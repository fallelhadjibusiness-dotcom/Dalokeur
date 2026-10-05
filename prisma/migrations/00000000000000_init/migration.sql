-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'PROVIDER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProviderStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'PENDING', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RequestMode" AS ENUM ('URGENT', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "PriceMode" AS ENUM ('FIXED_ESTIMATE', 'QUOTE_AFTER_DIAGNOSIS');

-- CreateEnum
CREATE TYPE "TrackingPolicy" AS ENUM ('NONE', 'LIVE_ON_CONSENT');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "LocationSource" AS ENUM ('GPS', 'PIN', 'MANUAL');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('RENT', 'SALE');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'VILLA', 'STUDIO', 'LAND', 'OFFICE');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('REQUESTED', 'CONFIRMED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" UUID NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role")
);

-- CreateTable
CREATE TABLE "provider_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "job_title" TEXT NOT NULL,
    "bio" TEXT,
    "experience_years" INTEGER NOT NULL DEFAULT 0,
    "zones" TEXT[],
    "available" BOOLEAN NOT NULL DEFAULT true,
    "status" "ProviderStatus" NOT NULL DEFAULT 'PENDING',
    "rating_avg" DECIMAL(2,1) NOT NULL DEFAULT 0,
    "missions_done" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMP(3),
    "verified_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_services" (
    "provider_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,

    CONSTRAINT "provider_services_pkey" PRIMARY KEY ("provider_id","service_id")
);

-- CreateTable
CREATE TABLE "provider_documents" (
    "id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "file_key" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_launch" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_mode" "PriceMode" NOT NULL DEFAULT 'FIXED_ESTIMATE',
    "base_price_fcfa" INTEGER,
    "tracking_policy" "TrackingPolicy" NOT NULL DEFAULT 'NONE',
    "allows_urgent" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accuracy_m" DOUBLE PRECISION,
    "address_line" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "landmark" TEXT NOT NULL,
    "approx_lat" DOUBLE PRECISION,
    "approx_lng" DOUBLE PRECISION,
    "source" "LocationSource" NOT NULL DEFAULT 'MANUAL',
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "client_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "mode" "RequestMode" NOT NULL,
    "description" TEXT NOT NULL,
    "photo_keys" TEXT[],
    "location_id" UUID NOT NULL,
    "zone" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "price_mode" "PriceMode" NOT NULL,
    "estimate_fcfa" INTEGER,
    "keur_points_used" INTEGER NOT NULL DEFAULT 0,
    "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
    "cancelled_by" UUID,
    "cancel_reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'OFFERED',
    "assigned_by" UUID,
    "offered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "decline_reason" TEXT,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_status_history" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "from_status" "RequestStatus",
    "to_status" "RequestStatus" NOT NULL,
    "actor_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_location_updates" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy_m" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "sharing_active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "live_location_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "attachment_key" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolved_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance_fcfa" INTEGER NOT NULL DEFAULT 0,
    "is_demo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_fcfa" INTEGER NOT NULL,
    "request_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keur_points" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "keur_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keur_point_transactions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "request_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keur_point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "listing_type" "ListingType" NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "price_fcfa" INTEGER NOT NULL,
    "district" TEXT NOT NULL,
    "approx_lat" DOUBLE PRECISION,
    "approx_lng" DOUBLE PRECISION,
    "exact_address" TEXT,
    "description" TEXT NOT NULL,
    "photo_keys" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_visits" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "request_id" UUID,
    "scheduled_at" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "provider_profiles_user_id_key" ON "provider_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_slug_key" ON "service_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "services_slug_key" ON "services"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "service_requests_reference_key" ON "service_requests"("reference");

-- CreateIndex
CREATE INDEX "service_requests_status_zone_service_id_idx" ON "service_requests"("status", "zone", "service_id");

-- CreateIndex
CREATE INDEX "service_requests_client_id_created_at_idx" ON "service_requests"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "assignments_provider_id_status_idx" ON "assignments"("provider_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_request_id_provider_id_key" ON "assignments"("request_id", "provider_id");

-- CreateIndex
CREATE INDEX "request_status_history_request_id_created_at_idx" ON "request_status_history"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "live_location_updates_assignment_id_recorded_at_idx" ON "live_location_updates"("assignment_id", "recorded_at");

-- CreateIndex
CREATE INDEX "messages_request_id_created_at_idx" ON "messages"("request_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_request_id_key" ON "reviews"("request_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "keur_points_user_id_key" ON "keur_points"("user_id");

-- CreateIndex
CREATE INDEX "keur_point_transactions_user_id_created_at_idx" ON "keur_point_transactions"("user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "property_visits_request_id_key" ON "property_visits"("request_id");

-- CreateIndex
CREATE INDEX "admin_actions_admin_id_created_at_idx" ON "admin_actions"("admin_id", "created_at");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_profiles" ADD CONSTRAINT "provider_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_services" ADD CONSTRAINT "provider_services_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_documents" ADD CONSTRAINT "provider_documents_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "service_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_location_updates" ADD CONSTRAINT "live_location_updates_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keur_points" ADD CONSTRAINT "keur_points_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keur_point_transactions" ADD CONSTRAINT "keur_point_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Contraintes métier non exprimables dans Prisma
CREATE UNIQUE INDEX "one_accepted_per_request" ON "assignments"("request_id") WHERE "status" = 'ACCEPTED';
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
ALTER TABLE "keur_points" ADD CONSTRAINT "keur_points_non_negative" CHECK ("balance" >= 0);
