-- DropForeignKey
ALTER TABLE "webhook_endpoints" DROP CONSTRAINT "webhook_endpoints_org_fkey";

-- AlterTable
ALTER TABLE "form_categories" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "form_signatures" ALTER COLUMN "signed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "form_submission_values" ALTER COLUMN "value_date" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "form_submissions" ALTER COLUMN "submitted_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "form_templates" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organizations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "push_subscriptions" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webauthn_credentials" ALTER COLUMN "registered_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "webhook_endpoints" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "work_locations" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- RenameForeignKey
ALTER TABLE "attendance_records" RENAME CONSTRAINT "attendance_records_wl_id_fkey" TO "attendance_records_work_location_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_notifications" RENAME CONSTRAINT "form_notifications_tmpl_fkey" TO "form_notifications_template_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_signatures" RENAME CONSTRAINT "form_signatures_sub_fkey" TO "form_signatures_submission_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_submission_values" RENAME CONSTRAINT "form_submission_values_field_fkey" TO "form_submission_values_field_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_submission_values" RENAME CONSTRAINT "form_submission_values_sub_fkey" TO "form_submission_values_submission_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_submissions" RENAME CONSTRAINT "form_submissions_org_fkey" TO "form_submissions_org_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_submissions" RENAME CONSTRAINT "form_submissions_tmpl_fkey" TO "form_submissions_template_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_submissions" RENAME CONSTRAINT "form_submissions_user_fkey" TO "form_submissions_submitted_by_fkey";

-- RenameForeignKey
ALTER TABLE "form_submissions" RENAME CONSTRAINT "form_submissions_wl_fkey" TO "form_submissions_work_location_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_templates" RENAME CONSTRAINT "form_templates_category_fkey" TO "form_templates_category_id_fkey";

-- RenameForeignKey
ALTER TABLE "form_templates" RENAME CONSTRAINT "form_templates_creator_fkey" TO "form_templates_created_by_fkey";

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "form_fields_template_key_key" RENAME TO "form_fields_template_id_key_key";

-- RenameIndex
ALTER INDEX "form_submissions_org_submitted_at_idx" RENAME TO "form_submissions_org_id_submitted_at_idx";

-- RenameIndex
ALTER INDEX "form_submissions_tmpl_org_period_idx" RENAME TO "form_submissions_template_id_org_id_period_key_idx";

-- RenameIndex
ALTER INDEX "webauthn_credentials_cred_id_key" RENAME TO "webauthn_credentials_credential_id_key";

-- RenameIndex
ALTER INDEX "webauthn_credentials_user_cred_key" RENAME TO "webauthn_credentials_user_id_credential_id_key";
