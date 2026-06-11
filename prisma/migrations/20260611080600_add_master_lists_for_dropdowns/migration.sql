-- CreateEnum
CREATE TYPE "MasterEntityType" AS ENUM ('POSITION', 'ROLE', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "departments" DROP CONSTRAINT "departments_org_id_fkey";

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "org_id" DROP NOT NULL,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "form_submissions" ADD COLUMN     "auto_approved_at" TIMESTAMP(3),
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "rejected_by_admin_id" TEXT,
ADD COLUMN     "rejection_reason" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "position_id" TEXT;

-- CreateTable
CREATE TABLE "master_positions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_roles" (
    "id" TEXT NOT NULL,
    "org_id" TEXT,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "master_list_suggestions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "suggested_by" TEXT NOT NULL,
    "entity_type" "MasterEntityType" NOT NULL,
    "value" TEXT NOT NULL,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_list_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "master_positions_org_id_active_idx" ON "master_positions"("org_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "master_positions_org_id_name_key" ON "master_positions"("org_id", "name");

-- CreateIndex
CREATE INDEX "master_roles_org_id_active_idx" ON "master_roles"("org_id", "active");

-- CreateIndex
CREATE UNIQUE INDEX "master_roles_org_id_name_key" ON "master_roles"("org_id", "name");

-- CreateIndex
CREATE INDEX "master_list_suggestions_org_id_status_idx" ON "master_list_suggestions"("org_id", "status");

-- CreateIndex
CREATE INDEX "master_list_suggestions_suggested_by_idx" ON "master_list_suggestions"("suggested_by");

-- CreateIndex
CREATE INDEX "departments_org_id_active_idx" ON "departments"("org_id", "active");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "master_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_rejected_by_admin_id_fkey" FOREIGN KEY ("rejected_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_positions" ADD CONSTRAINT "master_positions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_roles" ADD CONSTRAINT "master_roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_list_suggestions" ADD CONSTRAINT "master_list_suggestions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_list_suggestions" ADD CONSTRAINT "master_list_suggestions_suggested_by_fkey" FOREIGN KEY ("suggested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_list_suggestions" ADD CONSTRAINT "master_list_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
