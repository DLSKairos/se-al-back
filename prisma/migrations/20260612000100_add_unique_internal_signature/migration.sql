-- S-01: garantiza a nivel de BD que un usuario interno no pueda firmar dos veces
-- el mismo submission (el servicio captura P2002 -> ConflictException).
-- Los registros externos tienen internal_user_id NULL y no colisionan entre si.
CREATE UNIQUE INDEX "signature_records_submission_id_internal_user_id_key" ON "signature_records"("submission_id", "internal_user_id");
