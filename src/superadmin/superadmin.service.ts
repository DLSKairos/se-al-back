import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MagicLinkService } from '../magic-link/magic-link.service';
import { UpdateOrgConfigDto } from './dto/update-org-config.dto';

/**
 * SuperadminService — parametrización de organizaciones y métricas de uso.
 *
 * Cache Redis:
 *   superadmin:usage:{orgId}  TTL 60s  — métricas de uso
 *   org-config:{orgId}        TTL 30s  — OrgConfig (compartido con PlanLimitsGuard)
 */
@Injectable()
export class SuperadminService {
  private readonly logger = new Logger(SuperadminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly magicLink: MagicLinkService,
  ) {}

  // ─── Administradores de una organización ──────────────────────────────────

  async findAdministrators(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException('Organización no encontrada');

    return this.prisma.user.findMany({
      where: { org_id: orgId, role: 'ADMIN' },
      select: {
        id: true,
        name: true,
        email: true,
        is_active: true,
        oauth_provider: true,
        created_at: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Lista de organizaciones ──────────────────────────────────────────────

  async findAllOrganizations() {
    const organizations = await this.prisma.organization.findMany({
      include: {
        config: {
          select: { plan: true, max_users: true, max_sites: true, display_name: true },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    // Contar usuarios activos y sedes activas por org en paralelo
    const orgIds = organizations.map((o) => o.id);

    const [userCounts, siteCounts] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['org_id'],
        where: { org_id: { in: orgIds }, is_active: true },
        _count: { id: true },
      }),
      this.prisma.workLocation.groupBy({
        by: ['org_id'],
        where: { org_id: { in: orgIds }, is_active: true },
        _count: { id: true },
      }),
    ]);

    const userCountMap = new Map(userCounts.map((u) => [u.org_id, u._count.id]));
    const siteCountMap = new Map(siteCounts.map((s) => [s.org_id, s._count.id]));

    return organizations.map((org) => ({
      id: org.id,
      name: org.name,
      created_at: org.created_at,
      config: org.config ?? null,
      usage: {
        current_users: userCountMap.get(org.id) ?? 0,
        max_users: org.config?.max_users ?? null,
        current_sites: siteCountMap.get(org.id) ?? 0,
        max_sites: org.config?.max_sites ?? null,
        plan: org.config?.plan ?? null,
      },
    }));
  }

  // ─── Detalle de organización ──────────────────────────────────────────────

  async findOneOrganization(orgId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { config: true },
    });

    if (!org) {
      throw new NotFoundException('Organización no encontrada');
    }

    const [currentUsers, currentSites] = await Promise.all([
      this.prisma.user.count({ where: { org_id: orgId, is_active: true } }),
      this.prisma.workLocation.count({ where: { org_id: orgId, is_active: true } }),
    ]);

    return {
      id: org.id,
      name: org.name,
      created_at: org.created_at,
      config: org.config ?? null,
      usage: {
        current_users: currentUsers,
        max_users: org.config?.max_users ?? null,
        current_sites: currentSites,
        max_sites: org.config?.max_sites ?? null,
        plan: org.config?.plan ?? null,
      },
    };
  }

  // ─── Upsert OrgConfig ─────────────────────────────────────────────────────

  async upsertOrgConfig(
    orgId: string,
    superAdminId: string,
    dto: UpdateOrgConfigDto,
  ) {
    // Verificar que la org existe
    const orgExists = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });

    if (!orgExists) {
      throw new NotFoundException('Organización no encontrada');
    }

    const config = await this.prisma.orgConfig.upsert({
      where: { org_id: orgId },
      update: {
        ...dto,
        updated_by_super_admin_id: superAdminId,
      },
      create: {
        org_id: orgId,
        display_name: dto.display_name ?? orgExists.name,
        plan: dto.plan ?? 'STARTER',
        max_users: dto.max_users ?? 10,
        max_sites: dto.max_sites ?? 2,
        logo_url: dto.logo_url,
        primary_color: dto.primary_color,
        updated_by_super_admin_id: superAdminId,
      },
    });

    // Invalidar caché de OrgConfig
    await this.redis.del(`org-config:${orgId}`);

    this.logger.log(
      `OrgConfig actualizado para org ${orgId} por superadmin ${superAdminId}`,
    );

    return config;
  }

  // ─── Métricas de uso ──────────────────────────────────────────────────────

  async getUsage(orgId: string) {
    const cacheKey = `superadmin:usage:${orgId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Verificar que la org existe
    const orgExists = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true },
    });

    if (!orgExists) {
      throw new NotFoundException('Organización no encontrada');
    }

    const [currentUsers, currentSites, config] = await Promise.all([
      this.prisma.user.count({ where: { org_id: orgId, is_active: true } }),
      this.prisma.workLocation.count({ where: { org_id: orgId, is_active: true } }),
      this.prisma.orgConfig.findUnique({
        where: { org_id: orgId },
        select: { max_users: true, max_sites: true, plan: true },
      }),
    ]);

    const result = {
      current_users: currentUsers,
      max_users: config?.max_users ?? null,
      current_sites: currentSites,
      max_sites: config?.max_sites ?? null,
      plan: config?.plan ?? null,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 60);

    return result;
  }

  // ─── Magic link primer admin ──────────────────────────────────────────────

  async generateFirstAdminLink(orgId: string, superAdminId: string, userId: string) {
    // Validar que el usuario pertenece a la org
    const user = await this.prisma.user.findFirst({
      where: { id: userId, org_id: orgId },
      select: { id: true, name: true, role: true },
    });

    if (!user) {
      throw new BadRequestException(
        'El usuario no pertenece a esta organización',
      );
    }

    if (user.role !== 'ADMIN') {
      throw new BadRequestException(
        'Solo se puede generar el magic link de primer acceso para usuarios con rol ADMIN',
      );
    }

    const result = await this.magicLink.generateFirstAdminLink(userId, superAdminId);

    this.logger.log(
      `Magic link de primer acceso generado para user ${userId} (org ${orgId}) por superadmin ${superAdminId}`,
    );

    return result;
  }
}
