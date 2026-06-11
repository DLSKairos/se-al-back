import { PrismaClient, PlanTier } from '@prisma/client';

/**
 * Seed de OrgConfig por defecto para todas las organizaciones existentes.
 * Crea una fila OrgConfig con plan STARTER si no existe aún.
 * Idempotente: usa upsert por org_id.
 *
 * Ejecutar después de la migración add_org_config_and_plan_limits.
 */
export async function seedOrgConfigs(prisma: PrismaClient): Promise<void> {
  console.log('\n─── Seeding OrgConfig por defecto ───');

  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true },
  });

  let createdCount = 0;
  let skippedCount = 0;

  for (const org of orgs) {
    const result = await prisma.orgConfig.upsert({
      where: { org_id: org.id },
      update: {},
      create: {
        org_id: org.id,
        plan: PlanTier.STARTER,
        max_users: 10,
        max_sites: 2,
        display_name: org.name,
      },
    });

    // Si updated_at es muy reciente (menos de 5 seg) y no hay
    // updated_by_super_admin_id, es creación nueva.
    const isNew =
      result.updated_by_super_admin_id === null &&
      Date.now() - result.updated_at.getTime() < 5000;

    if (isNew) {
      createdCount++;
    } else {
      skippedCount++;
    }
  }

  console.log(
    `  OrgConfig: ${orgs.length} orgs procesadas, ${createdCount} creadas, ${skippedCount} ya existían`,
  );
}
