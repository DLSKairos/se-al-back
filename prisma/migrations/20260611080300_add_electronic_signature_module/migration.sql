-- CreateEnum
CREATE TYPE "SignerType" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "SignatureLinkStatus" AS ENUM ('SENT', 'VIEWED', 'SIGNED');

-- CreateEnum
CREATE TYPE "SignatureMode" AS ENUM ('STRICT', 'FLEXIBLE');

-- CreateTable
CREATE TABLE "external_signers" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "work_location_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "identification_number" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "photo_id_key" TEXT,
    "selfie_key" TEXT,
    "is_registered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_signers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "external_signer_id" TEXT NOT NULL,
    "link_status" "SignatureLinkStatus" NOT NULL DEFAULT 'SENT',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "viewed_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_records" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "signer_type" "SignerType" NOT NULL,
    "internal_user_id" TEXT,
    "external_signer_id" TEXT,
    "signature_token_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "geo_location" JSONB,
    "webauthn_session" BOOLEAN NOT NULL DEFAULT false,
    "reading_log" JSONB NOT NULL,
    "min_reading_seconds" INTEGER NOT NULL DEFAULT 30,
    "stroke_image_base64" TEXT NOT NULL,
    "stroke_vectors" JSONB NOT NULL,
    "document_hash" TEXT NOT NULL,
    "hash_version" INTEGER NOT NULL DEFAULT 1,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_configs" (
    "id" TEXT NOT NULL,
    "template_id" TEXT NOT NULL,
    "signature_mode" "SignatureMode" NOT NULL DEFAULT 'FLEXIBLE',
    "min_reading_seconds" INTEGER NOT NULL DEFAULT 30,
    "requires_internal_sign" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "external_signers_org_id_work_location_id_idx" ON "external_signers"("org_id", "work_location_id");

-- CreateIndex
CREATE UNIQUE INDEX "external_signers_work_location_id_identification_number_key" ON "external_signers"("work_location_id", "identification_number");

-- CreateIndex
CREATE UNIQUE INDEX "signature_tokens_token_key" ON "signature_tokens"("token");

-- CreateIndex
CREATE INDEX "signature_tokens_submission_id_idx" ON "signature_tokens"("submission_id");

-- CreateIndex
CREATE INDEX "signature_tokens_token_idx" ON "signature_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "signature_records_signature_token_id_key" ON "signature_records"("signature_token_id");

-- CreateIndex
CREATE INDEX "signature_records_submission_id_idx" ON "signature_records"("submission_id");

-- CreateIndex
CREATE INDEX "signature_records_internal_user_id_idx" ON "signature_records"("internal_user_id");

-- CreateIndex
CREATE INDEX "signature_records_external_signer_id_idx" ON "signature_records"("external_signer_id");

-- CreateIndex
CREATE UNIQUE INDEX "signature_configs_template_id_key" ON "signature_configs"("template_id");

-- AddForeignKey
ALTER TABLE "external_signers" ADD CONSTRAINT "external_signers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_signers" ADD CONSTRAINT "external_signers_work_location_id_fkey" FOREIGN KEY ("work_location_id") REFERENCES "work_locations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_tokens" ADD CONSTRAINT "signature_tokens_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_tokens" ADD CONSTRAINT "signature_tokens_external_signer_id_fkey" FOREIGN KEY ("external_signer_id") REFERENCES "external_signers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_records" ADD CONSTRAINT "signature_records_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "form_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_records" ADD CONSTRAINT "signature_records_internal_user_id_fkey" FOREIGN KEY ("internal_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_records" ADD CONSTRAINT "signature_records_external_signer_id_fkey" FOREIGN KEY ("external_signer_id") REFERENCES "external_signers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_records" ADD CONSTRAINT "signature_records_signature_token_id_fkey" FOREIGN KEY ("signature_token_id") REFERENCES "signature_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_configs" ADD CONSTRAINT "signature_configs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "form_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
