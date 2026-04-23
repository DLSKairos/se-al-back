import { PrismaClient, UserRole, FormTemplateStatus, Frequency, FieldType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ─── BLUEPRINTS GLOBALES ──────────────────────────────────────────────────────
// IDs fijos para garantizar idempotencia en upsert
const BLUEPRINT_IDS = {
  ALTURAS:           'clbp_alturas_001_senal_global',
  ESPACIOS_CONF:     'clbp_espacios_confinados_002_senal',
  TRABAJO_CALIENTE:  'clbp_trabajo_caliente_003_senal',
  IZAJE:             'clbp_izaje_cargas_004_senal_glb',
  EPP:               'clbp_lista_epp_005_senal_global',
  PREOPERACIONAL:    'clbp_preoperacional_006_senal_glb',
  INCIDENTE:         'clbp_reporte_incidente_007_senal',
};

interface BlueprintField {
  label: string;
  key: string;
  type: string;
  required: boolean;
  options?: string[];
  section: string;
  placeholder?: string;
}

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

  // ─── 8. BLUEPRINTS GLOBALES ───────────────────────────────────────────────

  await seedBlueprints();

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
  console.log(`  Blueprints    : 7 globales (is_global=true)`);
  console.log('─────────────────────────────────────────\n');
}

// ─── SEED DE BLUEPRINTS GLOBALES ─────────────────────────────────────────────

async function seedBlueprints(): Promise<void> {
  console.log('\n─── Seeding global FormBlueprints ───');

  const blueprints: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    fields: BlueprintField[];
  }> = [
    // ── 1. PERMISO DE TRABAJO EN ALTURAS ────────────────────────────────────
    {
      id: BLUEPRINT_IDS.ALTURAS,
      name: 'Permiso de Trabajo en Alturas',
      description: 'Formulario de permiso para trabajos en alturas según Resolución 1409 de 2012 y Resolución 0312.',
      category: 'Permisos de trabajo',
      fields: [
        // Identificación
        { label: 'Nombre del trabajador',  key: 'nombre_trabajador',  type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Cédula',                 key: 'cedula',             type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Cargo',                  key: 'cargo',              type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Empresa',                key: 'empresa',            type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Fecha',                  key: 'fecha',              type: FieldType.DATE,     required: true,  section: 'Identificación' },
        { label: 'Hora de inicio',         key: 'hora_inicio',        type: FieldType.DATETIME, required: true,  section: 'Identificación' },
        { label: 'Hora de fin',            key: 'hora_fin',           type: FieldType.DATETIME, required: true,  section: 'Identificación' },
        { label: 'Ubicación del trabajo',  key: 'ubicacion_trabajo',  type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        // Verificación EPP
        { label: 'Casco',                  key: 'casco',              type: FieldType.BOOLEAN,  required: true,  section: 'Verificación EPP' },
        { label: 'Arnés',                  key: 'arnes',              type: FieldType.BOOLEAN,  required: true,  section: 'Verificación EPP' },
        { label: 'Eslingas',               key: 'eslingas',           type: FieldType.BOOLEAN,  required: true,  section: 'Verificación EPP' },
        { label: 'Mosquetones',            key: 'mosquetones',        type: FieldType.BOOLEAN,  required: true,  section: 'Verificación EPP' },
        { label: 'Línea de vida',          key: 'linea_vida',         type: FieldType.BOOLEAN,  required: true,  section: 'Verificación EPP' },
        { label: 'Guantes',                key: 'guantes',            type: FieldType.BOOLEAN,  required: true,  section: 'Verificación EPP' },
        { label: 'Botas',                  key: 'botas',              type: FieldType.BOOLEAN,  required: true,  section: 'Verificación EPP' },
        { label: 'Observaciones EPP',      key: 'observaciones_epp',  type: FieldType.TEXT,     required: false, section: 'Verificación EPP' },
        // Condiciones del Área
        { label: 'Nivel de altura',         key: 'nivel_altura',            type: FieldType.NUMBER,  required: true,  section: 'Condiciones del Área', placeholder: 'metros' },
        { label: 'Condiciones climáticas',  key: 'condiciones_climaticas',   type: FieldType.SELECT,  required: true,  section: 'Condiciones del Área', options: ['Soleado','Nublado','Lluvioso','Viento fuerte'] },
        { label: 'Superficie de trabajo',   key: 'superficie_trabajo',       type: FieldType.SELECT,  required: true,  section: 'Condiciones del Área', options: ['Estable','Inestable','Mojada'] },
        { label: 'Riesgos eléctricos',      key: 'riesgos_electricos',       type: FieldType.BOOLEAN, required: true,  section: 'Condiciones del Área' },
        { label: 'Permiso del supervisor',  key: 'permiso_supervisor',       type: FieldType.BOOLEAN, required: true,  section: 'Condiciones del Área' },
        // Firmas
        { label: 'Firma del trabajador',  key: 'firma_trabajador',   type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del supervisor',  key: 'firma_supervisor',   type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del brigadista',  key: 'firma_brigadista',   type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
      ],
    },

    // ── 2. PERMISO DE TRABAJO EN ESPACIOS CONFINADOS ────────────────────────
    {
      id: BLUEPRINT_IDS.ESPACIOS_CONF,
      name: 'Permiso de Trabajo en Espacios Confinados',
      description: 'Formulario de permiso para trabajos en espacios confinados según Resolución 0312 y Decreto 1072.',
      category: 'Permisos de trabajo',
      fields: [
        // Identificación
        { label: 'Nombre del trabajador',  key: 'nombre_trabajador',  type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Cédula',                 key: 'cedula',             type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Cargo',                  key: 'cargo',              type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Fecha',                  key: 'fecha',              type: FieldType.DATE,     required: true,  section: 'Identificación' },
        { label: 'Hora de ingreso',        key: 'hora_ingreso',       type: FieldType.DATETIME, required: true,  section: 'Identificación' },
        { label: 'Hora de salida',         key: 'hora_salida',        type: FieldType.DATETIME, required: true,  section: 'Identificación' },
        { label: 'Espacio confinado',      key: 'espacio_confinado',  type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Tipo de espacio',        key: 'tipo_espacio',       type: FieldType.SELECT,   required: true,  section: 'Identificación', options: ['Tanque','Alcantarilla','Silo','Pozo','Otro'] },
        // Análisis de Atmósfera
        { label: 'Nivel de oxígeno',     key: 'nivel_oxigeno',     type: FieldType.NUMBER, required: true, section: 'Análisis de Atmósfera', placeholder: '%' },
        { label: 'Nivel LEL',            key: 'nivel_lel',         type: FieldType.NUMBER, required: true, section: 'Análisis de Atmósfera', placeholder: '% LEL' },
        { label: 'Nivel H2S',            key: 'nivel_h2s',         type: FieldType.NUMBER, required: true, section: 'Análisis de Atmósfera', placeholder: 'ppm' },
        { label: 'Nivel CO',             key: 'nivel_co',          type: FieldType.NUMBER, required: true, section: 'Análisis de Atmósfera', placeholder: 'ppm' },
        { label: 'Resultado de prueba',  key: 'resultado_prueba',  type: FieldType.SELECT, required: true, section: 'Análisis de Atmósfera', options: ['Apto','No Apto'] },
        // EPP
        { label: 'Respirador',                   key: 'respirador',               type: FieldType.SELECT,  required: true,  section: 'EPP', options: ['Purificador de aire','Suministro de aire','No requerido'] },
        { label: 'Arnés de rescate',             key: 'arnes_rescate',            type: FieldType.BOOLEAN, required: true,  section: 'EPP' },
        { label: 'Línea de comunicación',        key: 'linea_comunicacion',       type: FieldType.BOOLEAN, required: true,  section: 'EPP' },
        { label: 'Iluminación antiexplosión',    key: 'iluminacion_antiexplosion', type: FieldType.BOOLEAN, required: true, section: 'EPP' },
        { label: 'Equipo de rescate',            key: 'equipo_rescate',           type: FieldType.BOOLEAN, required: true,  section: 'EPP' },
        // Firmas
        { label: 'Firma del trabajador',      key: 'firma_trabajador',      type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del supervisor SSE',  key: 'firma_supervisor_sse',  type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del vigía',           key: 'firma_vigia',           type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
      ],
    },

    // ── 3. PERMISO DE TRABAJO EN CALIENTE ───────────────────────────────────
    {
      id: BLUEPRINT_IDS.TRABAJO_CALIENTE,
      name: 'Permiso de Trabajo en Caliente',
      description: 'Formulario de permiso para trabajos en caliente (soldadura, corte, esmerilado) según normativa SST colombiana.',
      category: 'Permisos de trabajo',
      fields: [
        // Identificación
        { label: 'Nombre del trabajador',    key: 'nombre_trabajador',    type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Cédula',                   key: 'cedula',               type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Fecha',                    key: 'fecha',                type: FieldType.DATE,     required: true,  section: 'Identificación' },
        { label: 'Hora de inicio',           key: 'hora_inicio',          type: FieldType.DATETIME, required: true,  section: 'Identificación' },
        { label: 'Hora de fin',              key: 'hora_fin',             type: FieldType.DATETIME, required: true,  section: 'Identificación' },
        { label: 'Tipo de trabajo',          key: 'tipo_trabajo',         type: FieldType.SELECT,   required: true,  section: 'Identificación', options: ['Soldadura','Corte','Esmerilado','Otro'] },
        { label: 'Ubicación',                key: 'ubicacion',            type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Descripción del trabajo',  key: 'descripcion_trabajo',  type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        // Análisis de Riesgo
        { label: 'Materiales inflamables en área',          key: 'materiales_inflamables_area',         type: FieldType.BOOLEAN, required: true,  section: 'Análisis de Riesgo' },
        { label: 'Distancia a materiales inflamables',      key: 'distancia_materiales_inflamables',    type: FieldType.NUMBER,  required: true,  section: 'Análisis de Riesgo', placeholder: 'metros' },
        { label: 'Ventilación adecuada',                    key: 'ventilacion_adecuada',                type: FieldType.BOOLEAN, required: true,  section: 'Análisis de Riesgo' },
        { label: 'Extintor disponible',                     key: 'extintor_disponible',                 type: FieldType.BOOLEAN, required: true,  section: 'Análisis de Riesgo' },
        { label: 'Tipo de extintor',                        key: 'tipo_extintor',                       type: FieldType.SELECT,  required: true,  section: 'Análisis de Riesgo', options: ['CO2','Polvo químico','Agua'] },
        { label: 'Detector de gas',                         key: 'detector_gas',                        type: FieldType.BOOLEAN, required: true,  section: 'Análisis de Riesgo' },
        // EPP
        { label: 'Careta de soldadura',   key: 'careta_soldadura',   type: FieldType.BOOLEAN, required: true, section: 'EPP' },
        { label: 'Guantes de cuero',      key: 'guantes_cuero',      type: FieldType.BOOLEAN, required: true, section: 'EPP' },
        { label: 'Delantal de cuero',     key: 'delantal_cuero',     type: FieldType.BOOLEAN, required: true, section: 'EPP' },
        { label: 'Botas punta de acero',  key: 'botas_punta_acero',  type: FieldType.BOOLEAN, required: true, section: 'EPP' },
        { label: 'Respirador de humos',   key: 'respirador_humos',   type: FieldType.BOOLEAN, required: true, section: 'EPP' },
        // Firmas
        { label: 'Firma del trabajador',  key: 'firma_trabajador',  type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del supervisor',  key: 'firma_supervisor',  type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
      ],
    },

    // ── 4. PERMISO DE IZAJE DE CARGAS ───────────────────────────────────────
    {
      id: BLUEPRINT_IDS.IZAJE,
      name: 'Permiso de Izaje de Cargas',
      description: 'Formulario de permiso para izaje de cargas con grúas y equipos de elevación según normativa SST colombiana.',
      category: 'Permisos de trabajo',
      fields: [
        // Identificación
        { label: 'Nombre del operador',   key: 'nombre_operador',   type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Cédula',                key: 'cedula',            type: FieldType.TEXT,     required: true,  section: 'Identificación' },
        { label: 'Fecha',                 key: 'fecha',             type: FieldType.DATE,     required: true,  section: 'Identificación' },
        { label: 'Hora de inicio',        key: 'hora_inicio',       type: FieldType.DATETIME, required: true,  section: 'Identificación' },
        { label: 'Equipo de izaje',       key: 'equipo_izaje',      type: FieldType.SELECT,   required: true,  section: 'Identificación', options: ['Grúa torre','Grúa móvil','Montacargas','Tecle','Diferencial'] },
        { label: 'Capacidad del equipo',  key: 'capacidad_equipo',  type: FieldType.NUMBER,   required: true,  section: 'Identificación', placeholder: 'Toneladas' },
        // Verificación Equipo
        { label: 'Certificado vigente',          key: 'certificado_vigente',        type: FieldType.BOOLEAN, required: true,  section: 'Verificación Equipo' },
        { label: 'Inspección preoperacional',    key: 'inspeccion_preoperacional',  type: FieldType.BOOLEAN, required: true,  section: 'Verificación Equipo' },
        { label: 'Operador certificado',         key: 'operador_certificado',       type: FieldType.BOOLEAN, required: true,  section: 'Verificación Equipo' },
        { label: 'Peso de la carga',             key: 'peso_carga',                 type: FieldType.NUMBER,  required: true,  section: 'Verificación Equipo', placeholder: 'Toneladas' },
        { label: 'Descripción de la carga',      key: 'descripcion_carga',          type: FieldType.TEXT,    required: true,  section: 'Verificación Equipo' },
        { label: 'Punto de enganche',            key: 'punto_enganche',             type: FieldType.TEXT,    required: true,  section: 'Verificación Equipo' },
        // Plan de Izaje
        { label: 'Radio de operación',         key: 'radio_operacion',            type: FieldType.NUMBER,  required: true,  section: 'Plan de Izaje', placeholder: 'metros' },
        { label: 'Altura máxima',              key: 'altura_maxima',              type: FieldType.NUMBER,  required: true,  section: 'Plan de Izaje', placeholder: 'metros' },
        { label: 'Ruta de izaje',              key: 'ruta_izaje',                 type: FieldType.TEXT,    required: true,  section: 'Plan de Izaje' },
        { label: 'Personal en área despejada', key: 'personal_area_despejada',    type: FieldType.BOOLEAN, required: true,  section: 'Plan de Izaje' },
        { label: 'Señalero designado',         key: 'senalero_designado',          type: FieldType.BOOLEAN, required: true,  section: 'Plan de Izaje' },
        { label: 'Comunicación establecida',   key: 'comunicacion_establecida',    type: FieldType.BOOLEAN, required: true,  section: 'Plan de Izaje' },
        // Firmas
        { label: 'Firma del operador',   key: 'firma_operador',   type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del supervisor', key: 'firma_supervisor', type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del rigger',     key: 'firma_rigger',     type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
      ],
    },

    // ── 5. LISTA DE CHEQUEO DE EPP ──────────────────────────────────────────
    {
      id: BLUEPRINT_IDS.EPP,
      name: 'Lista de Chequeo de EPP',
      description: 'Inspección de elementos de protección personal por trabajador según Resolución 0312.',
      category: 'Inspecciones',
      fields: [
        // Datos del Trabajador
        { label: 'Nombre',              key: 'nombre',             type: FieldType.TEXT, required: true,  section: 'Datos del Trabajador' },
        { label: 'Cédula',             key: 'cedula',             type: FieldType.TEXT, required: true,  section: 'Datos del Trabajador' },
        { label: 'Cargo',              key: 'cargo',              type: FieldType.TEXT, required: true,  section: 'Datos del Trabajador' },
        { label: 'Área',               key: 'area',               type: FieldType.TEXT, required: true,  section: 'Datos del Trabajador' },
        { label: 'Fecha de inspección', key: 'fecha_inspeccion',  type: FieldType.DATE, required: true,  section: 'Datos del Trabajador' },
        { label: 'Inspector',          key: 'inspector',          type: FieldType.TEXT, required: true,  section: 'Datos del Trabajador' },
        // Protección de Cabeza
        { label: 'Casco presente',       key: 'casco_presente',    type: FieldType.BOOLEAN, required: true,  section: 'Protección de Cabeza' },
        { label: 'Condición del casco',  key: 'casco_condicion',   type: FieldType.SELECT,  required: true,  section: 'Protección de Cabeza', options: ['Bueno','Regular','Malo'] },
        { label: 'Vencimiento del casco',key: 'casco_vencimiento', type: FieldType.DATE,    required: false, section: 'Protección de Cabeza' },
        // Protección Visual
        { label: 'Gafas de seguridad',   key: 'gafas_seguridad',   type: FieldType.BOOLEAN, required: true,  section: 'Protección Visual' },
        { label: 'Condición de gafas',   key: 'gafas_condicion',   type: FieldType.SELECT,  required: true,  section: 'Protección Visual', options: ['Bueno','Regular','Malo'] },
        { label: 'Careta facial',        key: 'careta_facial',     type: FieldType.BOOLEAN, required: false, section: 'Protección Visual' },
        // Protección Respiratoria
        { label: 'Respirador presente',  key: 'respirador_presente', type: FieldType.BOOLEAN, required: true,  section: 'Protección Respiratoria' },
        { label: 'Tipo de respirador',   key: 'tipo_respirador',     type: FieldType.SELECT,  required: true,  section: 'Protección Respiratoria', options: ['N95','Media cara','Cara completa','No aplica'] },
        { label: 'Filtros vigentes',     key: 'filtros_vigentes',    type: FieldType.BOOLEAN, required: false, section: 'Protección Respiratoria' },
        // Protección Corporal
        { label: 'Overol',                key: 'overol',              type: FieldType.BOOLEAN, required: true,  section: 'Protección Corporal' },
        { label: 'Condición del overol',  key: 'overol_condicion',    type: FieldType.SELECT,  required: true,  section: 'Protección Corporal', options: ['Bueno','Regular','Malo'] },
        { label: 'Guantes',              key: 'guantes',             type: FieldType.BOOLEAN, required: true,  section: 'Protección Corporal' },
        { label: 'Tipo de guantes',      key: 'tipo_guantes',        type: FieldType.TEXT,    required: false, section: 'Protección Corporal' },
        { label: 'Botas',                key: 'botas',               type: FieldType.BOOLEAN, required: true,  section: 'Protección Corporal' },
        { label: 'Condición de botas',   key: 'botas_condicion',     type: FieldType.SELECT,  required: true,  section: 'Protección Corporal', options: ['Bueno','Regular','Malo'] },
        // Observaciones
        { label: 'Observaciones generales', key: 'observaciones_generales', type: FieldType.TEXT,      required: false, section: 'Observaciones' },
        { label: 'Acción correctiva',       key: 'accion_correctiva',       type: FieldType.TEXT,      required: false, section: 'Observaciones' },
        { label: 'Firma del inspector',     key: 'firma_inspector',         type: FieldType.SIGNATURE, required: true,  section: 'Observaciones' },
        { label: 'Firma del trabajador',    key: 'firma_trabajador',        type: FieldType.SIGNATURE, required: true,  section: 'Observaciones' },
      ],
    },

    // ── 6. INSPECCIÓN PRE-OPERACIONAL DE EQUIPOS ────────────────────────────
    {
      id: BLUEPRINT_IDS.PREOPERACIONAL,
      name: 'Inspección Pre-operacional de Equipos',
      description: 'Chequeo diario pre-operacional de maquinaria y vehículos según normativa SST colombiana.',
      category: 'Inspecciones',
      fields: [
        // Datos del Equipo
        { label: 'Tipo de equipo',          key: 'tipo_equipo',           type: FieldType.TEXT,     required: true,  section: 'Datos del Equipo' },
        { label: 'Código del equipo',        key: 'codigo_equipo',         type: FieldType.TEXT,     required: true,  section: 'Datos del Equipo' },
        { label: 'Placa',                    key: 'placa',                 type: FieldType.TEXT,     required: false, section: 'Datos del Equipo' },
        { label: 'Operador',                 key: 'operador',              type: FieldType.TEXT,     required: true,  section: 'Datos del Equipo' },
        { label: 'Fecha',                    key: 'fecha',                 type: FieldType.DATE,     required: true,  section: 'Datos del Equipo' },
        { label: 'Hora',                     key: 'hora',                  type: FieldType.DATETIME, required: true,  section: 'Datos del Equipo' },
        { label: 'Kilometraje / Horómetro',  key: 'kilometraje_horometro', type: FieldType.NUMBER,   required: true,  section: 'Datos del Equipo' },
        // Sistema Motor
        { label: 'Nivel de aceite',       key: 'nivel_aceite',       type: FieldType.SELECT, required: true, section: 'Sistema Motor', options: ['OK','Bajo','Crítico'] },
        { label: 'Nivel de refrigerante', key: 'nivel_refrigerante', type: FieldType.SELECT, required: true, section: 'Sistema Motor', options: ['OK','Bajo','Crítico'] },
        { label: 'Nivel de combustible',  key: 'nivel_combustible',  type: FieldType.SELECT, required: true, section: 'Sistema Motor', options: ['Lleno','3/4','1/2','1/4','Reserva'] },
        { label: 'Batería',               key: 'bateria',            type: FieldType.SELECT, required: true, section: 'Sistema Motor', options: ['OK','Débil','Mala'] },
        { label: 'Fugas visibles',        key: 'fugas_visibles',     type: FieldType.BOOLEAN,required: true, section: 'Sistema Motor' },
        // Sistema Hidráulico
        { label: 'Nivel aceite hidráulico', key: 'nivel_aceite_hidraulico', type: FieldType.SELECT, required: true, section: 'Sistema Hidráulico', options: ['OK','Bajo','Crítico'] },
        { label: 'Condición mangueras',     key: 'mangueras_condicion',     type: FieldType.SELECT, required: true, section: 'Sistema Hidráulico', options: ['Bueno','Regular','Malo'] },
        { label: 'Condición cilindros',     key: 'cilindros_condicion',     type: FieldType.SELECT, required: true, section: 'Sistema Hidráulico', options: ['Bueno','Regular','Malo'] },
        // Seguridad
        { label: 'Cinturón de seguridad',    key: 'cinturon_seguridad',    type: FieldType.BOOLEAN, required: true, section: 'Seguridad' },
        { label: 'Extintor cargado',          key: 'extintor_cargado',      type: FieldType.BOOLEAN, required: true, section: 'Seguridad' },
        { label: 'Bocina',                    key: 'bocina',                type: FieldType.BOOLEAN, required: true, section: 'Seguridad' },
        { label: 'Luces funcionando',         key: 'luces_funcionando',     type: FieldType.BOOLEAN, required: true, section: 'Seguridad' },
        { label: 'Espejos retrovisores',      key: 'espejos_retrovisores',  type: FieldType.BOOLEAN, required: true, section: 'Seguridad' },
        { label: 'Señales de advertencia',    key: 'senales_advertencia',    type: FieldType.BOOLEAN, required: true, section: 'Seguridad' },
        // Resultado
        { label: 'Equipo apto',           key: 'equipo_apto',        type: FieldType.BOOLEAN,   required: true,  section: 'Resultado' },
        { label: 'Observaciones',         key: 'observaciones',      type: FieldType.TEXT,       required: false, section: 'Resultado' },
        { label: 'Firma del operador',    key: 'firma_operador',     type: FieldType.SIGNATURE,  required: true,  section: 'Resultado' },
        { label: 'Firma del supervisor',  key: 'firma_supervisor',   type: FieldType.SIGNATURE,  required: true,  section: 'Resultado' },
      ],
    },

    // ── 7. REPORTE DE INCIDENTE ─────────────────────────────────────────────
    {
      id: BLUEPRINT_IDS.INCIDENTE,
      name: 'Reporte de Incidente',
      description: 'Reporte de accidentes, incidentes y casi accidentes según Decreto 1530 de 1996 y Resolución 0312.',
      category: 'Reportes',
      fields: [
        // Datos del Incidente
        { label: 'Fecha del incidente',    key: 'fecha_incidente',    type: FieldType.DATE,        required: true,  section: 'Datos del Incidente' },
        { label: 'Hora del incidente',     key: 'hora_incidente',     type: FieldType.DATETIME,    required: true,  section: 'Datos del Incidente' },
        { label: 'Tipo de incidente',      key: 'tipo_incidente',     type: FieldType.SELECT,      required: true,  section: 'Datos del Incidente', options: ['Accidente','Incidente','Casi accidente','Enfermedad laboral'] },
        { label: 'Severidad',              key: 'severidad',          type: FieldType.SELECT,      required: true,  section: 'Datos del Incidente', options: ['Sin lesión','Primeros auxilios','Médico','Incapacitante','Fatalidad'] },
        { label: 'Ubicación',              key: 'ubicacion',          type: FieldType.TEXT,        required: true,  section: 'Datos del Incidente' },
        { label: 'Área',                   key: 'area',               type: FieldType.TEXT,        required: true,  section: 'Datos del Incidente' },
        { label: 'Fotografía del incidente', key: 'fotografia_incidente', type: FieldType.PHOTO,   required: false, section: 'Datos del Incidente' },
        { label: 'Geolocalización',        key: 'geolocalizacion',    type: FieldType.GEOLOCATION, required: false, section: 'Datos del Incidente' },
        // Personas Involucradas
        { label: 'Nombre del afectado',   key: 'nombre_afectado',   type: FieldType.TEXT,   required: true,  section: 'Personas Involucradas' },
        { label: 'Cédula del afectado',   key: 'cedula_afectado',   type: FieldType.TEXT,   required: true,  section: 'Personas Involucradas' },
        { label: 'Cargo del afectado',    key: 'cargo_afectado',    type: FieldType.TEXT,   required: true,  section: 'Personas Involucradas' },
        { label: 'Antigüedad',            key: 'antiguedad',        type: FieldType.NUMBER, required: true,  section: 'Personas Involucradas', placeholder: 'meses' },
        { label: 'Tipo de contrato',      key: 'tipo_contrato',     type: FieldType.SELECT, required: true,  section: 'Personas Involucradas', options: ['Directo','Contratista','Temporal'] },
        // Descripción
        { label: 'Descripción detallada',       key: 'descripcion_detallada',    type: FieldType.TEXT,   required: true,  section: 'Descripción' },
        { label: 'Causa inmediata',             key: 'causa_inmediata',          type: FieldType.TEXT,   required: true,  section: 'Descripción' },
        { label: 'Causa básica',               key: 'causa_basica',              type: FieldType.TEXT,   required: false, section: 'Descripción' },
        { label: 'Parte del cuerpo afectada',  key: 'parte_cuerpo_afectada',    type: FieldType.SELECT, required: true,  section: 'Descripción', options: ['Cabeza','Ojos','Manos','Pies','Tronco','Múltiples','Ninguna'] },
        // Testigos
        { label: 'Nombre testigo 1', key: 'nombre_testigo1', type: FieldType.TEXT, required: false, section: 'Testigos' },
        { label: 'Cargo testigo 1',  key: 'cargo_testigo1',  type: FieldType.TEXT, required: false, section: 'Testigos' },
        { label: 'Nombre testigo 2', key: 'nombre_testigo2', type: FieldType.TEXT, required: false, section: 'Testigos' },
        { label: 'Cargo testigo 2',  key: 'cargo_testigo2',  type: FieldType.TEXT, required: false, section: 'Testigos' },
        // Acciones Inmediatas
        { label: 'Primeros auxilios',      key: 'primeros_auxilios',     type: FieldType.BOOLEAN, required: true,  section: 'Acciones Inmediatas' },
        { label: 'Atención médica',        key: 'atencion_medica',       type: FieldType.BOOLEAN, required: true,  section: 'Acciones Inmediatas' },
        { label: 'Descripción de atención',key: 'descripcion_atencion',  type: FieldType.TEXT,    required: false, section: 'Acciones Inmediatas' },
        { label: 'Área asegurada',         key: 'area_asegurada',        type: FieldType.BOOLEAN, required: true,  section: 'Acciones Inmediatas' },
        { label: 'Reporte a ARL',          key: 'reporte_arl',           type: FieldType.BOOLEAN, required: true,  section: 'Acciones Inmediatas' },
        // Firmas
        { label: 'Firma del afectado',   key: 'firma_afectado',   type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma del supervisor', key: 'firma_supervisor', type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
        { label: 'Firma SST',            key: 'firma_sst',        type: FieldType.SIGNATURE, required: true, section: 'Firmas' },
      ],
    },
  ];

  let count = 0;
  for (const bp of blueprints) {
    await (prisma as any).formBlueprint.upsert({
      where: { id: bp.id },
      update: {
        name: bp.name,
        description: bp.description,
        category: bp.category,
        fields: bp.fields as any,
        is_global: true,
        org_id: null,
      },
      create: {
        id: bp.id,
        name: bp.name,
        description: bp.description,
        category: bp.category,
        is_global: true,
        org_id: null,
        fields: bp.fields as any,
      },
    });
    count++;
    console.log(`  Blueprint upserted: "${bp.name}" (${bp.fields.length} campos)`);
  }

  console.log(`\nSeed completado: ${count} blueprints creados/actualizados`);
}

main()
  .catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
