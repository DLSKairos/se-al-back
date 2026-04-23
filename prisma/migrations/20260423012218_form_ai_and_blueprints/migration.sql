-- AlterTable
ALTER TABLE "form_fields" ADD COLUMN     "help_text" TEXT,
ADD COLUMN     "placeholder" TEXT,
ADD COLUMN     "section" TEXT;

-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN     "columns" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "sections" JSONB,
ADD COLUMN     "source_file_url" TEXT;

-- CreateTable
CREATE TABLE "form_blueprints" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "org_id" TEXT,
    "fields" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "form_blueprints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "form_blueprints_is_global_idx" ON "form_blueprints"("is_global");

-- CreateIndex
CREATE INDEX "form_blueprints_org_id_idx" ON "form_blueprints"("org_id");

-- AddForeignKey
ALTER TABLE "form_blueprints" ADD CONSTRAINT "form_blueprints_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
