import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * StatusService — contexto mínimo del usuario autenticado.
 *
 * Diseñado para responder en < 300ms.
 * Cache Redis TTL 60s por userId.
 * Clave: user_context:{userId}
 */
@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getUserContext(userId: string) {
    const cacheKey = `user_context:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    // Obtener el usuario primero para saber el work_location_id
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        job_title: true,
        org_id: true,
        work_location_id: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Consultar org y work_location en paralelo
    const [org, workLocation] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: user.org_id },
        select: {
          id: true,
          name: true,
          config: { select: { logo_url: true, primary_color: true } },
        },
      }),
      user.work_location_id
        ? this.prisma.workLocation.findUnique({
            where: { id: user.work_location_id },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    if (!org) {
      this.logger.error(`Organización ${user.org_id} no encontrada para user ${userId}`);
      throw new NotFoundException('Organización no encontrada');
    }

    const result = {
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        jobTitle: user.job_title,
      },
      organization: {
        id: org.id,
        name: org.name,
        logo_url: org.config?.logo_url ?? null,
        primary_color: org.config?.primary_color ?? null,
      },
      workLocation: workLocation
        ? { id: workLocation.id, name: workLocation.name }
        : null,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 60);

    return result;
  }
}
