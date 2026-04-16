-- CreateIndex
CREATE INDEX "attendance_records_user_id_org_id_service_date_idx" ON "attendance_records"("user_id", "org_id", "service_date");
