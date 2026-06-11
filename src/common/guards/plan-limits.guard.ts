import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  PLAN_LIMIT_RESOURCE_KEY,
  PlanLimitResource,
} from '../decorators/plan-limit-resource.decorator';
import { JwtPayload } from '../../auth/dto/jwt-payload.dto';

/**
 * Guard que verifica los límites de plan antes de crear usuarios o sedes.
 * Requiere el decorator @PlanLimitResource('users' | 'sites') en el endpoint.
 * SUPER_ADMIN siempre está exento.
 *
 * Cache Redis:
 *   org-config:{orgId}          TTL 30s — OrgConfig
 *   plan_limits:{orgId}:users   TTL 30s — conteo de usuarios activos
 *   plan_limits:{orgId}:sites   TTL 30s — conteo de sedes activas
 */
@Injectable()
export class PlanLimitsGuard implements CanActivate {
  private readonly logger = new Logger(PlanLimitsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const resource = this.reflector.getAllAndOverride<PlanLimitResource>(
      PLAN_LIMIT_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Sin decorator → no hay restricción
    if (!resource) return true;

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();

    // SUPER_ADMIN siempre pasa sin restricción
    if (user.role === 'SUPER_ADMIN') return true;

    const orgId = user.orgId;

    // Obtener OrgConfig con caché
    const orgConfig = await this.getOrgConfig(orgId);

    if (!orgConfig) {
      // Org sin config de plan → no bloquear
      this.logger.warn(
        `Org ${orgId} no tiene OrgConfig configurado. PlanLimitsGuard omitido.`,
      );
      return true;
    }

    if (resource === 'users') {
      const current = await this.getCurrentUserCount(orgId);
      const max = orgConfig.max_users;
      if (current >= max) {
        throw new ForbiddenException(
          `Tu plan ${orgConfig.plan} permite máximo ${max} usuarios. Contacta a Kairos para ampliar tu plan.`,
        );
      }
    } else if (resource === 'sites') {
      const current = await this.getCurrentSiteCount(orgId);
      const max = orgConfig.max_sites;
      if (current >= max) {
        throw new ForbiddenException(
          `Tu plan ${orgConfig.plan} permite máximo ${max} sedes. Contacta a Kairos para ampliar tu plan.`,
        );
      }
    }

    return true;
  }

  // ─── Helpers con caché Redis TTL 30s ──────────────────────────────────────

  private async getOrgConfig(orgId: string) {
    const cacheKey = `org-config:${orgId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as {
        plan: string;
        max_users: number;
        max_sites: number;
      };
    }

    const config = await this.prisma.orgConfig.findUnique({
      where: { org_id: orgId },
      select: { plan: true, max_users: true, max_sites: true },
    });

    if (config) {
      await this.redis.set(cacheKey, JSON.stringify(config), 30);
    }

    return config;
  }

  private async getCurrentUserCount(orgId: string): Promise<number> {
    const cacheKey = `plan_limits:${orgId}:users`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return parseInt(cached, 10);

    const count = await this.prisma.user.count({
      where: { org_id: orgId, is_active: true },
    });

    await this.redis.set(cacheKey, String(count), 30);
    return count;
  }

  private async getCurrentSiteCount(orgId: string): Promise<number> {
    const cacheKey = `plan_limits:${orgId}:sites`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return parseInt(cached, 10);

    const count = await this.prisma.workLocation.count({
      where: { org_id: orgId, is_active: true },
    });

    await this.redis.set(cacheKey, String(count), 30);
    return count;
  }
}
