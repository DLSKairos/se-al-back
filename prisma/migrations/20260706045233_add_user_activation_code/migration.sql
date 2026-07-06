-- AlterTable
ALTER TABLE "users" ADD COLUMN     "activation_code_hash" TEXT,
ADD COLUMN     "activation_expires_at" TIMESTAMP(3);
