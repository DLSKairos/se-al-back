import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Orden de truncation verificado contra prisma/schema.prisma.
 *
 * Regla aplicada: hijos antes que padres, siguiendo el grafo de FK:
 *
 * form_signatures          → form_submissions
 * form_submission_values   → form_submissions + form_fields
 * form_submissions         → form_templates + organizations + users + work_locations
 * form_notifications       → form_templates
 * form_fields              → form_templates
 * form_templates           → organizations + form_categories + users (created_by)
 * form_blueprints          → organizations (org_id nullable)
 * form_categories          → organizations
 * webauthn_credentials     → users
 * push_subscriptions       → users
 * attendance_records       → organizations + users + work_locations
 * attendance_config        → organizations
 * users                    → organizations + work_locations (work_location_id nullable — se resuelve con CASCADE)
 * work_locations           → organizations + departments
 * departments              → organizations
 * webhook_endpoints        → organizations
 * organizations            → raíz, sin FK entrantes dentro del schema
 *
 * Se usa RESTART IDENTITY CASCADE para:
 *  - Reiniciar secuencias (aunque el PK es cuid, es defensivo para cualquier serial oculto)
 *  - Cortar referencias que puedan quedar en orden inesperado (ej. users.work_location_id)
 */
const TRUNCATE_ORDER: string[] = [
  'form_signatures',
  'form_submission_values',
  'form_submissions',
  'form_notifications',
  'form_fields',
  'form_blueprints',
  'form_templates',
  'form_categories',
  'webauthn_credentials',
  'push_subscriptions',
  'attendance_records',
  'attendance_config',
  'webhook_endpoints',
  'users',
  'work_locations',
  'departments',
  'organizations',
];

export async function truncateAll(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TRUNCATE_ORDER.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
}
