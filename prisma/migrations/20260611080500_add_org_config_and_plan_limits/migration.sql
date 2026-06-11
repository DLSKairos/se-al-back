-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('STARTER', 'PROFESSIONAL', 'ENTERPRISE');

-- CreateTable
CREATE TABLE "org_configs" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'STARTER',
    "max_users" INTEGER NOT NULL DEFAULT 10,
    "max_sites" INTEGER NOT NULL DEFAULT 2,
    "display_name" TEXT NOT NULL,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_super_admin_id" TEXT,

    CONSTRAINT "org_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_configs_org_id_key" ON "org_configs"("org_id");

-- AddForeignKey
ALTER TABLE "org_configs" ADD CONSTRAINT "org_configs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_configs" ADD CONSTRAINT "org_configs_updated_by_super_admin_id_fkey" FOREIGN KEY ("updated_by_super_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
