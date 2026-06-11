-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" TEXT,
ADD COLUMN     "last_oauth_sync" TIMESTAMP(3),
ADD COLUMN     "oauth_access_token" TEXT,
ADD COLUMN     "oauth_provider" "OAuthProvider",
ADD COLUMN     "oauth_provider_id" TEXT,
ADD COLUMN     "oauth_refresh_token" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_oauth_provider_oauth_provider_id_idx" ON "users"("oauth_provider", "oauth_provider_id");
