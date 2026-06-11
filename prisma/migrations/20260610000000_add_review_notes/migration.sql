-- Migration: add review_notes to form_submissions
-- Generado para Fix #15 — motivo de rechazo en cambio de estado

ALTER TABLE "form_submissions" ADD COLUMN "review_notes" TEXT;
