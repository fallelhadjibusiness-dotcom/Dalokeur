ALTER TABLE "users" ADD COLUMN "totp_secret_enc" TEXT;
ALTER TABLE "users" ADD COLUMN "totp_enabled_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "totp_last_step" INTEGER;
ALTER TABLE "users" ADD COLUMN "totp_recovery" JSONB;
