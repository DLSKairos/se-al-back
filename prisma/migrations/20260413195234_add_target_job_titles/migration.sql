-- AlterTable
ALTER TABLE "form_templates" ADD COLUMN     "target_job_titles" TEXT[] DEFAULT ARRAY[]::TEXT[];
