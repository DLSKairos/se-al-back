import { PrismaClient } from '@prisma/client';

/**
 * Seed de listas maestras globales (org_id = null).
 * Son los valores de Kairos disponibles para todas las organizaciones.
 * Idempotente: usa upsert con skipDuplicates donde aplica.
 *
 * Ejecutar después de la migración add_master_lists_for_dropdowns.
 */
export async function seedMasterLists(prisma: PrismaClient): Promise<void> {
  console.log('\n─── Seeding listas maestras globales ───');

  // ─── DEPARTAMENTOS GLOBALES ──────────────────────────────────────────────────
  // org_id = null indica que son globales (visibles para todas las orgs)

  const globalDepts = [
    'Operaciones',
    'SST',
    'Recursos Humanos',
    'Administración',
    'Logística',
    'Mantenimiento',
    'Proyectos',
  ];

  let deptCount = 0;
  for (const name of globalDepts) {
    // El unique de Department es [org_id, name]. Con org_id=null en PostgreSQL,
    // NULL != NULL, así que no existe constraint unique cross-null.
    // Usamos findFirst para detectar duplicados globales manualmente.
    const existing = await prisma.department.findFirst({
      where: { org_id: null, name },
    });

    if (!existing) {
      await prisma.department.create({
        data: { org_id: null, name, email: null, active: true },
      });
      deptCount++;
    }
  }

  console.log(
    `  Departamentos globales: ${globalDepts.length} en lista, ${deptCount} creados (resto ya existían)`,
  );

  // ─── ROLES OPERATIVOS GLOBALES (MasterRole) ──────────────────────────────────

  const globalRoles = [
    'Supervisor',
    'Operario de Campo',
    'Inspector SST',
    'Residente de Obra',
    'Director de Proyecto',
    'Coordinador',
    'Auxiliar Administrativo',
    'Técnico',
  ];

  let roleCount = 0;
  for (const name of globalRoles) {
    const existing = await prisma.masterRole.findFirst({
      where: { org_id: null, name },
    });

    if (!existing) {
      await prisma.masterRole.create({
        data: { org_id: null, name, active: true },
      });
      roleCount++;
    }
  }

  console.log(
    `  Roles operativos globales: ${globalRoles.length} en lista, ${roleCount} creados (resto ya existían)`,
  );

  // ─── CARGOS GLOBALES (MasterPosition) ────────────────────────────────────────

  const globalPositions = [
    'Soldador',
    'Electricista',
    'Operador de Maquinaria',
    'Topógrafo',
    'Albañil',
    'Plomero',
    'Pintor',
    'Ayudante General',
    'Conductor',
    'Mecánico',
  ];

  let posCount = 0;
  for (const name of globalPositions) {
    const existing = await prisma.masterPosition.findFirst({
      where: { org_id: null, name },
    });

    if (!existing) {
      await prisma.masterPosition.create({
        data: { org_id: null, name, active: true },
      });
      posCount++;
    }
  }

  console.log(
    `  Cargos globales: ${globalPositions.length} en lista, ${posCount} creados (resto ya existían)`,
  );
}
