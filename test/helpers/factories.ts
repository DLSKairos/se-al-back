import {
  FieldType,
  FormTemplateStatus,
  Frequency,
  UserRole,
  type FormField,
  type FormTemplate,
} from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

// ─── Organization ─────────────────────────────────────────────────────────────
// Campos obligatorios: name (unique). created_at tiene default.

export async function createTestOrg(
  prisma: PrismaService,
  name = `org-${Date.now()}`,
) {
  return prisma.organization.create({
    data: { name },
  });
}

// ─── Department ───────────────────────────────────────────────────────────────
// Campos obligatorios: org_id, name, email.
// Constraint unique([org_id, name]) — el nombre generado incluye timestamp.

export async function createTestDepartment(
  prisma: PrismaService,
  orgId: string,
  name = `dept-${Date.now()}`,
) {
  return prisma.department.create({
    data: {
      org_id: orgId,
      name,
      email: `${name}@test.local`,
    },
  });
}

// ─── WorkLocation ─────────────────────────────────────────────────────────────
// Campos obligatorios: org_id, name, contractor, lat, lng.
// department_id es opcional. is_active y created_at tienen default.
// Constraint unique([org_id, name]).

export async function createTestWorkLocation(
  prisma: PrismaService,
  orgId: string,
  name = `loc-${Date.now()}`,
) {
  return prisma.workLocation.create({
    data: {
      org_id: orgId,
      name,
      contractor: 'Test Contractor',
      lat: 4.710989,
      lng: -74.072092,
    },
  });
}

// ─── User ─────────────────────────────────────────────────────────────────────
// Campos obligatorios: org_id, name, identification_number (unique).
// work_location_id es opcional. job_title, role, is_active, pin_enabled tienen default.

export interface CreateUserOverrides {
  name?: string;
  identification_number?: string;
  role?: UserRole;
  work_location_id?: string;
  job_title?: string;
  is_active?: boolean;
}

export async function createTestUser(
  prisma: PrismaService,
  orgId: string,
  overrides: CreateUserOverrides = {},
) {
  const ts = Date.now();
  return prisma.user.create({
    data: {
      org_id: orgId,
      name: overrides.name ?? `Test User ${ts}`,
      identification_number: overrides.identification_number ?? `ID-${ts}`,
      role: overrides.role ?? UserRole.OPERATOR,
      work_location_id: overrides.work_location_id ?? null,
      job_title: overrides.job_title ?? 'Sin cargo',
      is_active: overrides.is_active ?? true,
    },
  });
}

// ─── AttendanceConfig ─────────────────────────────────────────────────────────
// Campos obligatorios: org_id (unique — uno por org).
// Todos los demás tienen default en el schema. Se usa upsert para que sea
// idempotente: si la org ya tiene config, actualiza los valores de test.

export async function createTestAttendanceConfig(
  prisma: PrismaService,
  orgId: string,
) {
  // Nota: lunch_minutes pertenece a AttendanceRecord, no a AttendanceConfig.
  // AttendanceConfig controla la configuración global de la org.
  return prisma.attendanceConfig.upsert({
    where: { org_id: orgId },
    update: {
      standard_daily_hours: 8,
      night_shift_start: '21:00',
      night_shift_end: '06:00',
      custom_holidays: [],
    },
    create: {
      org_id: orgId,
      is_enabled: true,
      standard_daily_hours: 8,
      night_shift_start: '21:00',
      night_shift_end: '06:00',
      sunday_surcharge: true,
      holiday_surcharge: true,
      custom_holidays: [],
    },
  });
}

// ─── FormCategory ─────────────────────────────────────────────────────────────
// Campos obligatorios: org_id, name.
// Constraint unique([org_id, name]).

export async function createTestFormCategory(
  prisma: PrismaService,
  orgId: string,
  name = `cat-${Date.now()}`,
) {
  return prisma.formCategory.create({
    data: {
      org_id: orgId,
      name,
      is_sst: false,
    },
  });
}

// ─── FormTemplate + FormField ─────────────────────────────────────────────────
// FormTemplate obligatorios: org_id, category_id, name, created_by.
// status, data_frequency, signature_frequency, export_pdf, columns tienen default.
// FormField obligatorios: template_id, order, label, key, type.
// required y revalidation_frequency tienen default.

export interface CreateFormWithFieldsResult {
  template: FormTemplate;
  fields: FormField[];
}

export async function createTestFormWithFields(
  prisma: PrismaService,
  orgId: string,
  categoryId: string,
  createdBy: string,
  frequency: Frequency = Frequency.ONCE,
): Promise<CreateFormWithFieldsResult> {
  const ts = Date.now();

  const template = await prisma.formTemplate.create({
    data: {
      org_id: orgId,
      category_id: categoryId,
      name: `Form ${ts}`,
      status: FormTemplateStatus.ACTIVE,
      data_frequency: frequency,
      signature_frequency: Frequency.NONE,
      created_by: createdBy,
    },
  });

  const field = await prisma.formField.create({
    data: {
      template_id: template.id,
      order: 1,
      label: 'Campo de texto',
      key: 'campo_texto',
      type: FieldType.TEXT,
      required: true,
      revalidation_frequency: Frequency.INHERIT,
    },
  });

  return { template, fields: [field] };
}

// ─── FormSubmission ───────────────────────────────────────────────────────────
// FormSubmission obligatorios: template_id, org_id, submitted_by, data.
// status y submitted_at tienen default.
// Se crea también 1 FormSubmissionValue TEXT para el fieldId recibido.

export async function createTestSubmission(
  prisma: PrismaService,
  orgId: string,
  templateId: string,
  userId: string,
  fieldId: string,
) {
  const submission = await prisma.formSubmission.create({
    data: {
      template_id: templateId,
      org_id: orgId,
      submitted_by: userId,
      data: {},
      values: {
        create: {
          field_id: fieldId,
          value_text: 'valor de prueba',
        },
      },
    },
    include: { values: true },
  });

  return submission;
}
