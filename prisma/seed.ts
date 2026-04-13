import { PrismaClient, UserRole, FormTemplateStatus, Frequency, FieldType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const SI_NO_NA_OPTIONS = [
  { label: 'SI', value: 'SI' },
  { label: 'NO', value: 'NO' },
  { label: 'NA', value: 'NA' },
];

const COLOMBIA_HOLIDAYS_2026: string[] = [
  '2026-01-01', // Año Nuevo
  '2026-01-12', // Reyes Magos (trasladado)
  '2026-03-23', // San José (trasladado)
  '2026-04-02', // Jueves Santo
  '2026-04-03', // Viernes Santo
  '2026-05-01', // Día del Trabajo
  '2026-05-18', // Ascensión del Señor (trasladado)
  '2026-06-08', // Corpus Christi (trasladado)
  '2026-06-29', // Sagrado Corazón / San Pedro y San Pablo (trasladado)
  '2026-07-20', // Independencia de Colombia
  '2026-08-07', // Batalla de Boyacá
  '2026-08-17', // Asunción de la Virgen (trasladado)
  '2026-10-12', // Día de la Raza (trasladado)
  '2026-11-02', // Todos los Santos (trasladado)
  '2026-11-16', // Independencia de Cartagena (trasladado)
  '2026-12-08', // Inmaculada Concepción
  '2026-12-25', // Navidad
];

async function main(): Promise<void> {
  console.log('Iniciando seed de SEÑAL...\n');

  // ─── 1. ORGANIZATION ──────────────────────────────────────

  const org = await prisma.organization.upsert({
    where: { name: 'Kairos Demo' },
    update: {},
    create: { name: 'Kairos Demo' },
  });

  console.log(`Organization: ${org.name} (${org.id})`);

  // ─── 2. DEPARTMENTS ───────────────────────────────────────

  const deptSST = await prisma.department.upsert({
    where: { org_id_name: { org_id: org.id, name: 'SST' } },
    update: {},
    create: {
      org_id: org.id,
      name: 'SST',
      email: 'sst@kairosdemo.com',
    },
  });

  const deptOps = await prisma.department.upsert({
    where: { org_id_name: { org_id: org.id, name: 'Operaciones' } },
    update: {},
    create: {
      org_id: org.id,
      name: 'Operaciones',
      email: 'operaciones@kairosdemo.com',
    },
  });

  console.log(`Departments: ${deptSST.name}, ${deptOps.name}`);

  // ─── 3. WORK LOCATIONS ────────────────────────────────────

  const obraNorte = await prisma.workLocation.upsert({
    where: { org_id_name: { org_id: org.id, name: 'Obra Norte' } },
    update: {},
    create: {
      org_id: org.id,
      department_id: deptSST.id,
      name: 'Obra Norte',
      contractor: 'Constructora ABC',
      lat: 4.710989,
      lng: -74.072092,
    },
  });

  const obraSur = await prisma.workLocation.upsert({
    where: { org_id_name: { org_id: org.id, name: 'Obra Sur' } },
    update: {},
    create: {
      org_id: org.id,
      department_id: deptOps.id,
      name: 'Obra Sur',
      contractor: 'Constructora XYZ',
      lat: 4.628231,
      lng: -74.06452,
    },
  });

  console.log(`WorkLocations: ${obraNorte.name}, ${obraSur.name}`);

  // ─── 4. USERS ─────────────────────────────────────────────

  const pinHash = await bcrypt.hash('1234', 10);

  const adminUser = await prisma.user.upsert({
    where: { identification_number: '1000000001' },
    update: {},
    create: {
      org_id: org.id,
      name: 'Admin Demo',
      identification_number: '1000000001',
      job_title: 'Administrador',
      role: UserRole.ADMIN,
      pin_enabled: true,
      pin_hash: pinHash,
    },
  });

  const operator1 = await prisma.user.upsert({
    where: { identification_number: '1000000002' },
    update: {},
    create: {
      org_id: org.id,
      work_location_id: obraNorte.id,
      name: 'Juan Pérez',
      identification_number: '1000000002',
      job_title: 'Operario',
      role: UserRole.OPERATOR,
      pin_enabled: true,
      pin_hash: pinHash,
    },
  });

  const operator2 = await prisma.user.upsert({
    where: { identification_number: '1000000003' },
    update: {},
    create: {
      org_id: org.id,
      work_location_id: obraSur.id,
      name: 'María García',
      identification_number: '1000000003',
      job_title: 'Supervisora SST',
      role: UserRole.OPERATOR,
      pin_enabled: false,
    },
  });

  console.log(`Users: ${adminUser.name} (ADMIN), ${operator1.name} (OPERATOR), ${operator2.name} (OPERATOR)`);

  // ─── 5. ATTENDANCE CONFIG ─────────────────────────────────

  const attendanceConfig = await prisma.attendanceConfig.upsert({
    where: { org_id: org.id },
    update: {},
    create: {
      org_id: org.id,
      is_enabled: true,
      standard_daily_hours: 8.0,
      night_shift_start: '21:00',
      night_shift_end: '06:00',
      sunday_surcharge: true,
      holiday_surcharge: true,
      custom_holidays: COLOMBIA_HOLIDAYS_2026,
    },
  });

  console.log(`AttendanceConfig: habilitado=${attendanceConfig.is_enabled}, festivos=${COLOMBIA_HOLIDAYS_2026.length}`);

  // ─── 6. FORM CATEGORY ─────────────────────────────────────

  const category = await prisma.formCategory.upsert({
    where: { org_id_name: { org_id: org.id, name: 'Seguridad y Salud en el Trabajo' } },
    update: {},
    create: {
      org_id: org.id,
      name: 'Seguridad y Salud en el Trabajo',
      is_sst: true,
    },
  });

  console.log(`FormCategory: ${category.name}`);

  // ─── 7. FORM TEMPLATE: PERMISO DE TRABAJO EN ALTURAS ──────

  // El template usa upsert por nombre dentro de la org.
  // FormField no tiene unique constraint natural para upsert directo,
  // así que se elimina y recrea los fields solo si el template es nuevo.

  const existingTemplate = await prisma.formTemplate.findFirst({
    where: {
      org_id: org.id,
      name: 'Permiso de Trabajo en Alturas',
    },
  });

  let template = existingTemplate;

  if (!existingTemplate) {
    const createdTemplate = await prisma.formTemplate.create({
      data: {
        org_id: org.id,
        category_id: category.id,
        name: 'Permiso de Trabajo en Alturas',
        description: 'Registro diario de permisos para trabajos en alturas según normativa SST colombiana.',
        status: FormTemplateStatus.ACTIVE,
        data_frequency: Frequency.DAILY,
        signature_frequency: Frequency.DAILY,
        export_pdf: true,
        export_excel: false,
        created_by: adminUser.id,
        fields: {
          create: [
            {
              order: 1,
              label: 'Tipo de trabajo',
              key: 'tipo_trabajo',
              type: FieldType.TEXT,
              required: true,
            },
            {
              order: 2,
              label: 'Trabajo rutinario',
              key: 'trabajo_rutinario',
              type: FieldType.SELECT,
              required: true,
              options: SI_NO_NA_OPTIONS,
            },
            {
              order: 3,
              label: 'Tarea en alturas',
              key: 'tarea_en_alturas',
              type: FieldType.SELECT,
              required: true,
              options: SI_NO_NA_OPTIONS,
            },
            {
              order: 4,
              label: 'Altura inicial (m)',
              key: 'altura_inicial',
              type: FieldType.NUMBER,
              required: true,
            },
            {
              order: 5,
              label: 'Altura final (m)',
              key: 'altura_final',
              type: FieldType.NUMBER,
              required: true,
            },
            {
              order: 6,
              label: 'Certificado de alturas vigente',
              key: 'certificado_alturas',
              type: FieldType.SELECT,
              required: true,
              options: SI_NO_NA_OPTIONS,
            },
            {
              order: 7,
              label: 'Casco tipo 1',
              key: 'casco_tipo1',
              type: FieldType.SELECT,
              required: true,
              options: SI_NO_NA_OPTIONS,
            },
            {
              order: 8,
              label: 'Arnés cuerpo entero',
              key: 'arnes_cuerpo_entero',
              type: FieldType.SELECT,
              required: true,
              options: SI_NO_NA_OPTIONS,
            },
            {
              order: 9,
              label: 'Observaciones',
              key: 'observaciones',
              type: FieldType.TEXT,
              required: false,
            },
            {
              order: 10,
              label: 'Firma responsable',
              key: 'firma_responsable',
              type: FieldType.SIGNATURE,
              required: true,
            },
          ],
        },
      },
      include: { fields: true },
    });

    template = createdTemplate;
    console.log(`FormTemplate: "${createdTemplate.name}" creado con ${createdTemplate.fields.length} campos`);
  } else {
    const fieldCount = await prisma.formField.count({ where: { template_id: existingTemplate.id } });
    console.log(`FormTemplate: "${existingTemplate.name}" ya existe (${fieldCount} campos) — omitido`);
  }

  // ─── RESUMEN ──────────────────────────────────────────────

  console.log('\n─────────────────────────────────────────');
  console.log('Seed completado exitosamente.');
  console.log('─────────────────────────────────────────');
  console.log(`  Organization  : ${org.name}`);
  console.log(`  Departments   : 2 (SST, Operaciones)`);
  console.log(`  WorkLocations : 2 (Obra Norte, Obra Sur)`);
  console.log(`  Users         : 3 (1 ADMIN, 2 OPERATOR)`);
  console.log(`    PIN "1234"  : Admin Demo, Juan Pérez`);
  console.log(`  AttendanceConfig : habilitado, ${COLOMBIA_HOLIDAYS_2026.length} festivos 2026`);
  console.log(`  FormCategories: 1 (SST)`);
  console.log(`  FormTemplates : 1 (Permiso de Trabajo en Alturas, ACTIVE)`);
  console.log('─────────────────────────────────────────\n');
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
