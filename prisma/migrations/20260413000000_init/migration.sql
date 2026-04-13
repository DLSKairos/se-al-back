-- ============================================================
-- Migración inicial — SEÑAL SaaS SST Colombia
-- 20260413000000_init
-- Generado manualmente a partir del schema Prisma.
-- Las secciones marcadas con "SQL RAW" contienen constraints
-- que Prisma no puede expresar en el schema (.prisma).
-- ============================================================

BEGIN;

-- ─── ENUMS ───────────────────────────────────────────────────────────────────

CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'OPERATOR');

CREATE TYPE "FormTemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

CREATE TYPE "FieldType" AS ENUM (
  'TEXT', 'NUMBER', 'DATE', 'DATETIME',
  'SELECT', 'MULTISELECT', 'BOOLEAN',
  'SIGNATURE', 'PHOTO', 'GEOLOCATION', 'FILE'
);

CREATE TYPE "Frequency" AS ENUM (
  'INHERIT', 'NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'PER_EVENT', 'ONCE'
);

CREATE TYPE "NotificationTrigger" AS ENUM (
  'ON_SUBMIT', 'ON_APPROVE', 'ON_REJECT', 'SCHEDULED'
);

CREATE TYPE "SubmissionStatus" AS ENUM (
  'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'
);

-- ─── TABLA: organizations ─────────────────────────────────────────────────────

CREATE TABLE "organizations" (
  "id"         TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "organizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizations_name_key" UNIQUE ("name")
);

COMMENT ON TABLE "organizations" IS
  'Raíz del multitenancy. Cada cliente SaaS es una organización.';

-- ─── TABLA: departments ──────────────────────────────────────────────────────

CREATE TABLE "departments" (
  "id"     TEXT NOT NULL,
  "org_id" TEXT NOT NULL,
  "name"   TEXT NOT NULL,
  "email"  TEXT NOT NULL,

  CONSTRAINT "departments_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "departments_org_id_name_key" UNIQUE ("org_id", "name"),
  CONSTRAINT "departments_org_id_fkey" FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── TABLA: work_locations ───────────────────────────────────────────────────

CREATE TABLE "work_locations" (
  "id"            TEXT           NOT NULL,
  "org_id"        TEXT           NOT NULL,
  "department_id" TEXT,
  "name"          TEXT           NOT NULL,
  "contractor"    TEXT           NOT NULL,
  "lat"           DECIMAL(10, 6) NOT NULL,
  "lng"           DECIMAL(10, 6) NOT NULL,
  "is_active"     BOOLEAN        NOT NULL DEFAULT TRUE,
  "created_at"    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT "work_locations_pkey"            PRIMARY KEY ("id"),
  CONSTRAINT "work_locations_org_id_name_key" UNIQUE ("org_id", "name"),
  CONSTRAINT "work_locations_org_id_fkey"     FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "work_locations_department_id_fkey" FOREIGN KEY ("department_id")
    REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "work_locations_org_id_is_active_idx"
  ON "work_locations" ("org_id", "is_active");

-- ─── TABLA: users ─────────────────────────────────────────────────────────────

CREATE TABLE "users" (
  "id"                    TEXT        NOT NULL,
  "org_id"                TEXT        NOT NULL,
  "work_location_id"      TEXT,
  "name"                  TEXT        NOT NULL,
  "identification_number" TEXT        NOT NULL,
  "job_title"             TEXT        NOT NULL DEFAULT 'Sin cargo',
  "role"                  "UserRole"  NOT NULL DEFAULT 'OPERATOR',
  "is_active"             BOOLEAN     NOT NULL DEFAULT TRUE,
  "pin_enabled"           BOOLEAN     NOT NULL DEFAULT FALSE,
  "pin_hash"              TEXT,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "users_pkey"                      PRIMARY KEY ("id"),
  CONSTRAINT "users_identification_number_key" UNIQUE ("identification_number"),
  CONSTRAINT "users_org_id_fkey"               FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "users_work_location_id_fkey"     FOREIGN KEY ("work_location_id")
    REFERENCES "work_locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "users_org_id_is_active_idx" ON "users" ("org_id", "is_active");

COMMENT ON COLUMN "users"."pin_hash" IS
  'Hash bcrypt del PIN numérico (4-6 dígitos). NULL hasta que el usuario lo configure.';

-- ─── TABLA: webauthn_credentials ─────────────────────────────────────────────

CREATE TABLE "webauthn_credentials" (
  "id"                 TEXT        NOT NULL,
  "user_id"            TEXT        NOT NULL,
  "credential_id"      TEXT        NOT NULL,
  "public_key"         TEXT        NOT NULL,
  "sign_count"         INTEGER     NOT NULL DEFAULT 0,
  "authenticator_type" TEXT,
  "registered_at"      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "webauthn_credentials_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "webauthn_credentials_cred_id_key"   UNIQUE ("credential_id"),
  CONSTRAINT "webauthn_credentials_user_cred_key" UNIQUE ("user_id", "credential_id"),
  CONSTRAINT "webauthn_credentials_user_id_fkey"  FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─── TABLA: push_subscriptions ───────────────────────────────────────────────

CREATE TABLE "push_subscriptions" (
  "user_id"      TEXT        NOT NULL,
  "subscription" JSONB       NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON COLUMN "push_subscriptions"."subscription" IS
  'Objeto Web Push: { endpoint, keys: { p256dh, auth } }';

-- ─── TABLA: attendance_config ────────────────────────────────────────────────

CREATE TABLE "attendance_config" (
  "id"                   TEXT    NOT NULL,
  "org_id"               TEXT    NOT NULL,
  "is_enabled"           BOOLEAN NOT NULL DEFAULT FALSE,
  "standard_daily_hours" DOUBLE PRECISION NOT NULL DEFAULT 8.0,
  "night_shift_start"    TEXT    NOT NULL DEFAULT '21:00',
  "night_shift_end"      TEXT    NOT NULL DEFAULT '06:00',
  "sunday_surcharge"     BOOLEAN NOT NULL DEFAULT TRUE,
  "holiday_surcharge"    BOOLEAN NOT NULL DEFAULT TRUE,
  "custom_holidays"      JSONB   NOT NULL DEFAULT '[]',

  CONSTRAINT "attendance_config_pkey"          PRIMARY KEY ("id"),
  CONSTRAINT "attendance_config_org_id_key"    UNIQUE ("org_id"),
  CONSTRAINT "attendance_config_org_id_fkey"   FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

COMMENT ON COLUMN "attendance_config"."night_shift_start" IS
  'Hora inicio recargo nocturno, formato HH:MM. Validado por CHECK constraint.';
COMMENT ON COLUMN "attendance_config"."night_shift_end" IS
  'Hora fin recargo nocturno, formato HH:MM. Validado por CHECK constraint.';
COMMENT ON COLUMN "attendance_config"."custom_holidays" IS
  'Array JSON de fechas adicionales (ISO 8601) consideradas festivos para esta org.';

-- ─── TABLA: attendance_records ───────────────────────────────────────────────

CREATE TABLE "attendance_records" (
  "id"                    TEXT        NOT NULL,
  "org_id"                TEXT        NOT NULL,
  "user_id"               TEXT        NOT NULL,
  "work_location_id"      TEXT,
  "service_date"          DATE        NOT NULL,
  "entry_time"            TIME(6)     NOT NULL,
  "exit_time"             TIME(6),
  "lunch_minutes"         INTEGER,
  "total_minutes"         INTEGER,
  "regular_minutes"       INTEGER,
  "extra_day_minutes"     INTEGER,
  "extra_night_minutes"   INTEGER,
  "extra_sunday_minutes"  INTEGER,
  "extra_holiday_minutes" INTEGER,

  CONSTRAINT "attendance_records_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "attendance_records_org_id_fkey"      FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_records_user_id_fkey"     FOREIGN KEY ("user_id")
    REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "attendance_records_wl_id_fkey"       FOREIGN KEY ("work_location_id")
    REFERENCES "work_locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "attendance_records_org_id_service_date_idx"
  ON "attendance_records" ("org_id", "service_date");

CREATE INDEX "attendance_records_user_id_service_date_idx"
  ON "attendance_records" ("user_id", "service_date");

-- ─── TABLA: form_categories ──────────────────────────────────────────────────

CREATE TABLE "form_categories" (
  "id"         TEXT        NOT NULL,
  "org_id"     TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "is_sst"     BOOLEAN     NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "form_categories_pkey"              PRIMARY KEY ("id"),
  CONSTRAINT "form_categories_org_id_name_key"   UNIQUE ("org_id", "name"),
  CONSTRAINT "form_categories_org_id_fkey"       FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── TABLA: form_templates ───────────────────────────────────────────────────

CREATE TABLE "form_templates" (
  "id"                  TEXT                 NOT NULL,
  "org_id"              TEXT                 NOT NULL,
  "category_id"         TEXT                 NOT NULL,
  "name"                TEXT                 NOT NULL,
  "description"         TEXT,
  "icon"                TEXT,
  "status"              "FormTemplateStatus" NOT NULL DEFAULT 'DRAFT',
  "data_frequency"      "Frequency"          NOT NULL DEFAULT 'ONCE',
  "signature_frequency" "Frequency"          NOT NULL DEFAULT 'NONE',
  "export_pdf"          BOOLEAN              NOT NULL DEFAULT TRUE,
  "export_excel"        BOOLEAN              NOT NULL DEFAULT FALSE,
  "created_by"          TEXT                 NOT NULL,
  "created_at"          TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  "updated_at"          TIMESTAMPTZ          NOT NULL,

  CONSTRAINT "form_templates_pkey"           PRIMARY KEY ("id"),
  CONSTRAINT "form_templates_org_id_fkey"    FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "form_templates_category_fkey"  FOREIGN KEY ("category_id")
    REFERENCES "form_categories" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "form_templates_creator_fkey"   FOREIGN KEY ("created_by")
    REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "form_templates_org_id_status_idx"
  ON "form_templates" ("org_id", "status");

-- ─── TABLA: form_fields ──────────────────────────────────────────────────────

CREATE TABLE "form_fields" (
  "id"                     TEXT        NOT NULL,
  "template_id"            TEXT        NOT NULL,
  "order"                  INTEGER     NOT NULL,
  "label"                  TEXT        NOT NULL,
  "key"                    TEXT        NOT NULL,
  "type"                   "FieldType" NOT NULL,
  "required"               BOOLEAN     NOT NULL DEFAULT TRUE,
  "default_value"          TEXT,
  "options"                JSONB,
  "validations"            JSONB,
  "revalidation_frequency" "Frequency" NOT NULL DEFAULT 'INHERIT',

  CONSTRAINT "form_fields_pkey"               PRIMARY KEY ("id"),
  CONSTRAINT "form_fields_template_key_key"   UNIQUE ("template_id", "key"),
  CONSTRAINT "form_fields_template_id_fkey"   FOREIGN KEY ("template_id")
    REFERENCES "form_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON COLUMN "form_fields"."options" IS
  'Para SELECT/MULTISELECT: { "choices": ["Opción A", "Opción B"] }. Para PHOTO: { "maxFiles": 3 }.';
COMMENT ON COLUMN "form_fields"."validations" IS
  'Reglas extra: { "min": 0, "max": 100, "pattern": "^[A-Z]+" }.';

-- ─── TABLA: form_notifications ───────────────────────────────────────────────

CREATE TABLE "form_notifications" (
  "id"          TEXT                  NOT NULL,
  "template_id" TEXT                  NOT NULL,
  "trigger"     "NotificationTrigger" NOT NULL,
  "recipients"  JSONB                 NOT NULL,
  "channels"    JSONB                 NOT NULL,
  "subject"     TEXT,
  "body"        TEXT,
  "enabled"     BOOLEAN               NOT NULL DEFAULT TRUE,

  CONSTRAINT "form_notifications_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "form_notifications_tmpl_fkey"   FOREIGN KEY ("template_id")
    REFERENCES "form_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

COMMENT ON COLUMN "form_notifications"."recipients" IS
  'Array de objetos: [{ "type": "role", "value": "ADMIN" }, { "type": "user", "value": "<user_id>" }]';
COMMENT ON COLUMN "form_notifications"."channels" IS
  'Array de strings: ["email", "push", "whatsapp"]';

-- ─── TABLA: form_submissions ─────────────────────────────────────────────────

CREATE TABLE "form_submissions" (
  "id"               TEXT              NOT NULL,
  "template_id"      TEXT              NOT NULL,
  "org_id"           TEXT              NOT NULL,
  "submitted_by"     TEXT              NOT NULL,
  "work_location_id" TEXT,
  "submitted_at"     TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
  "status"           "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
  "period_key"       TEXT,
  "data"             JSONB             NOT NULL,
  "geo_lat"          DOUBLE PRECISION,
  "geo_lng"          DOUBLE PRECISION,

  CONSTRAINT "form_submissions_pkey"         PRIMARY KEY ("id"),
  CONSTRAINT "form_submissions_tmpl_fkey"    FOREIGN KEY ("template_id")
    REFERENCES "form_templates" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "form_submissions_org_fkey"     FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "form_submissions_user_fkey"    FOREIGN KEY ("submitted_by")
    REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "form_submissions_wl_fkey"      FOREIGN KEY ("work_location_id")
    REFERENCES "work_locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "form_submissions_tmpl_org_period_idx"
  ON "form_submissions" ("template_id", "org_id", "period_key");

CREATE INDEX "form_submissions_org_submitted_at_idx"
  ON "form_submissions" ("org_id", "submitted_at" DESC);

-- ─── TABLA: form_submission_values ───────────────────────────────────────────

CREATE TABLE "form_submission_values" (
  "id"            TEXT      NOT NULL,
  "submission_id" TEXT      NOT NULL,
  "field_id"      TEXT      NOT NULL,
  "value_text"    TEXT,
  "value_number"  DOUBLE PRECISION,
  "value_date"    TIMESTAMPTZ,
  "value_json"    JSONB,
  "value_file"    TEXT,

  CONSTRAINT "form_submission_values_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "form_submission_values_sub_fkey"  FOREIGN KEY ("submission_id")
    REFERENCES "form_submissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "form_submission_values_field_fkey" FOREIGN KEY ("field_id")
    REFERENCES "form_fields" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

COMMENT ON TABLE "form_submission_values" IS
  'EAV (Entity-Attribute-Value) por tipo. Solo una columna value_* debe estar poblada por fila.';

-- ─── TABLA: form_signatures ──────────────────────────────────────────────────

CREATE TABLE "form_signatures" (
  "id"            TEXT        NOT NULL,
  "submission_id" TEXT        NOT NULL,
  "signer_name"   TEXT        NOT NULL,
  "signer_role"   TEXT,
  "signer_doc"    TEXT,
  "signature_url" TEXT        NOT NULL,
  "signed_at"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "form_signatures_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "form_signatures_sub_fkey"  FOREIGN KEY ("submission_id")
    REFERENCES "form_submissions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ─── TABLA: webhook_endpoints ────────────────────────────────────────────────

CREATE TABLE "webhook_endpoints" (
  "id"          TEXT        NOT NULL,
  "org_id"      TEXT        NOT NULL,
  "url"         TEXT        NOT NULL,
  "secret"      TEXT        NOT NULL,
  "event_types" JSONB,
  "is_active"   BOOLEAN     NOT NULL DEFAULT TRUE,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "webhook_endpoints_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "webhook_endpoints_org_fkey"   FOREIGN KEY ("org_id")
    REFERENCES "organizations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- ============================================================
-- SQL RAW — Constraints de negocio no expresables en Prisma
-- ============================================================

-- lunch_minutes: si está presente debe ser entre 1 y 60 minutos.
-- Un receso de 0 min no tiene sentido; el máximo razonable es 60 min.
ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_lunch_minutes_check"
    CHECK (
      lunch_minutes IS NULL
      OR (lunch_minutes >= 1 AND lunch_minutes <= 60)
    );

COMMENT ON COLUMN "attendance_records"."lunch_minutes" IS
  'Minutos de almuerzo descontados. Debe ser entre 1 y 60 cuando no es NULL.';

-- night_shift_start / night_shift_end: formato HH:MM (00:00 – 23:59).
-- Prisma no soporta CHECK con regex; usamos ~ (operador de regex POSIX).
ALTER TABLE "attendance_config"
  ADD CONSTRAINT "attendance_config_night_shift_start_format_check"
    CHECK (night_shift_start ~ '^([01]\d|2[0-3]):[0-5]\d$');

ALTER TABLE "attendance_config"
  ADD CONSTRAINT "attendance_config_night_shift_end_format_check"
    CHECK (night_shift_end ~ '^([01]\d|2[0-3]):[0-5]\d$');

-- work_locations lat/lng: rangos geográficos válidos.
ALTER TABLE "work_locations"
  ADD CONSTRAINT "work_locations_lat_range_check"
    CHECK (lat >= -90 AND lat <= 90);

ALTER TABLE "work_locations"
  ADD CONSTRAINT "work_locations_lng_range_check"
    CHECK (lng >= -180 AND lng <= 180);

COMMENT ON COLUMN "work_locations"."lat" IS
  'Latitud WGS-84. Rango válido: -90.0 a 90.0.';
COMMENT ON COLUMN "work_locations"."lng" IS
  'Longitud WGS-84. Rango válido: -180.0 a 180.0.';

-- ============================================================
-- SQL RAW — Índice parcial único para registros de asistencia abiertos
-- ============================================================

-- Previene que un usuario tenga más de un registro de entrada sin salida
-- en el mismo día. Equivalente al legacy idx_horas_jornada_sin_duplicados_abiertos.
-- Prisma no puede expresar WHERE en @@index, por eso va aquí como SQL raw.
CREATE UNIQUE INDEX "attendance_no_duplicate_open"
  ON "attendance_records" ("user_id", "service_date", "entry_time")
  WHERE exit_time IS NULL;

-- Nota: PostgreSQL no soporta COMMENT ON INDEX.
-- La documentación del índice vive en este archivo y en el schema.prisma.

COMMIT;
