import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MasterEntityType, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateMasterItemDto } from './dto/create-master-item.dto';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';

/**
 * MasterListsService — gestión de catálogos maestros (cargos, roles operativos, departamentos).
 *
 * Patrón global/org:
 * - Registros con org_id = null son globales (seed de Kairos), solo lectura para admins.
 * - Registros con org_id = X son propios de la org.
 *
 * Cache Redis: master:{type}:{orgId} TTL 300s
 * Invalidación al crear, editar o desactivar.
 */
@Injectable()
export class MasterListsService {
  private readonly logger = new Logger(MasterListsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Lectura ──────────────────────────────────────────────────────────────

  async findPositions(orgId: string) {
    return this.getCachedList('positions', orgId, async () => {
      return this.prisma.masterPosition.findMany({
        where: {
          active: true,
          OR: [{ org_id: null }, { org_id: orgId }],
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, org_id: true },
      });
    });
  }

  async findRoles(orgId: string) {
    return this.getCachedList('roles', orgId, async () => {
      return this.prisma.masterRole.findMany({
        where: {
          active: true,
          OR: [{ org_id: null }, { org_id: orgId }],
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, org_id: true },
      });
    });
  }

  async findDepartments(orgId: string) {
    return this.getCachedList('departments', orgId, async () => {
      return this.prisma.department.findMany({
        where: {
          active: true,
          OR: [{ org_id: null }, { org_id: orgId }],
        },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, org_id: true },
      });
    });
  }

  // ─── Creación (admin) ─────────────────────────────────────────────────────

  async createPosition(orgId: string, dto: CreateMasterItemDto) {
    const item = await this.prisma.masterPosition.create({
      data: { org_id: orgId, name: dto.name },
    });
    await this.invalidateCache('positions', orgId);
    return item;
  }

  async createRole(orgId: string, dto: CreateMasterItemDto) {
    const item = await this.prisma.masterRole.create({
      data: { org_id: orgId, name: dto.name },
    });
    await this.invalidateCache('roles', orgId);
    return item;
  }

  async createDepartment(orgId: string, dto: CreateMasterItemDto) {
    const item = await this.prisma.department.create({
      data: { org_id: orgId, name: dto.name },
    });
    await this.invalidateCache('departments', orgId);
    return item;
  }

  // ─── Edición (admin) ──────────────────────────────────────────────────────

  async updateItem(
    type: 'positions' | 'roles' | 'departments',
    id: string,
    orgId: string,
    dto: CreateMasterItemDto,
  ) {
    await this.assertOrgOwnership(type, id, orgId);

    let updated: { id: string; name: string };

    if (type === 'positions') {
      updated = await this.prisma.masterPosition.update({
        where: { id },
        data: { name: dto.name },
        select: { id: true, name: true },
      });
    } else if (type === 'roles') {
      updated = await this.prisma.masterRole.update({
        where: { id },
        data: { name: dto.name },
        select: { id: true, name: true },
      });
    } else {
      updated = await this.prisma.department.update({
        where: { id },
        data: { name: dto.name },
        select: { id: true, name: true },
      });
    }

    await this.invalidateCache(type, orgId);
    return updated;
  }

  // ─── Desactivar (soft delete, admin) ─────────────────────────────────────

  async deactivateItem(
    type: 'positions' | 'roles' | 'departments',
    id: string,
    orgId: string,
  ) {
    await this.assertOrgOwnership(type, id, orgId);

    if (type === 'positions') {
      await this.prisma.masterPosition.update({ where: { id }, data: { active: false } });
    } else if (type === 'roles') {
      await this.prisma.masterRole.update({ where: { id }, data: { active: false } });
    } else {
      await this.prisma.department.update({ where: { id }, data: { active: false } });
    }

    await this.invalidateCache(type, orgId);

    return { success: true, message: 'Elemento desactivado exitosamente' };
  }

  // ─── Sugerencias ──────────────────────────────────────────────────────────

  async createSuggestion(
    orgId: string,
    userId: string,
    dto: CreateSuggestionDto,
  ) {
    const suggestion = await this.prisma.masterListSuggestion.create({
      data: {
        org_id: orgId,
        suggested_by: userId,
        entity_type: dto.type,
        value: dto.name,
      },
    });

    // Notificar a los admins de la org sobre la sugerencia pendiente
    const admins = await this.prisma.user.findMany({
      where: { org_id: orgId, role: 'ADMIN', is_active: true },
      select: { id: true },
    });

    await Promise.allSettled(
      admins.map((admin) =>
        this.notifications.create({
          user_id: admin.id,
          type: NotificationType.SYSTEM_ALERT,
          title: 'Nueva sugerencia de lista maestra',
          body: `Un usuario ha sugerido agregar "${dto.name}" a la lista de ${this.getTypeLabel(dto.type)}.`,
          deep_link: '/admin/master/suggestions',
        }),
      ),
    );

    return suggestion;
  }

  async findPendingSuggestions(orgId: string) {
    return this.prisma.masterListSuggestion.findMany({
      where: { org_id: orgId, status: 'PENDING' },
      include: {
        suggester: { select: { id: true, name: true } },
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async approveSuggestion(
    suggestionId: string,
    orgId: string,
    reviewerId: string,
  ) {
    const suggestion = await this.prisma.masterListSuggestion.findFirst({
      where: { id: suggestionId, org_id: orgId, status: 'PENDING' },
      include: { suggester: { select: { id: true } } },
    });

    if (!suggestion) {
      throw new NotFoundException('Sugerencia no encontrada o ya procesada');
    }

    // Crear el registro en la lista maestra correspondiente
    let createdItem: { id: string; name: string } | null = null;

    try {
      if (suggestion.entity_type === MasterEntityType.POSITION) {
        createdItem = await this.prisma.masterPosition.create({
          data: { org_id: orgId, name: suggestion.value },
          select: { id: true, name: true },
        });
        await this.invalidateCache('positions', orgId);
      } else if (suggestion.entity_type === MasterEntityType.ROLE) {
        createdItem = await this.prisma.masterRole.create({
          data: { org_id: orgId, name: suggestion.value },
          select: { id: true, name: true },
        });
        await this.invalidateCache('roles', orgId);
      } else if (suggestion.entity_type === MasterEntityType.DEPARTMENT) {
        createdItem = await this.prisma.department.create({
          data: { org_id: orgId, name: suggestion.value },
          select: { id: true, name: true },
        });
        await this.invalidateCache('departments', orgId);
      }
    } catch {
      // Si ya existe (unique violation), igual marcar como aprobada
      this.logger.warn(
        `Elemento "${suggestion.value}" ya existe en la lista maestra de ${suggestion.entity_type}`,
      );
    }

    // Actualizar estado de la sugerencia
    await this.prisma.masterListSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'APPROVED',
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
      },
    });

    // Notificar al sugerente
    await this.notifications
      .create({
        user_id: suggestion.suggested_by,
        type: NotificationType.SYSTEM_ALERT,
        title: 'Sugerencia aprobada',
        body: `Tu sugerencia "${suggestion.value}" fue aprobada y agregada a la lista de ${this.getTypeLabel(suggestion.entity_type)}.`,
      })
      .catch((err) => {
        this.logger.error(`Error notificando sugerencia aprobada: ${err.message}`);
      });

    return { success: true, created_item: createdItem };
  }

  async rejectSuggestion(
    suggestionId: string,
    orgId: string,
    reviewerId: string,
  ) {
    const suggestion = await this.prisma.masterListSuggestion.findFirst({
      where: { id: suggestionId, org_id: orgId, status: 'PENDING' },
    });

    if (!suggestion) {
      throw new NotFoundException('Sugerencia no encontrada o ya procesada');
    }

    await this.prisma.masterListSuggestion.update({
      where: { id: suggestionId },
      data: {
        status: 'REJECTED',
        reviewed_by: reviewerId,
        reviewed_at: new Date(),
      },
    });

    return { success: true, message: 'Sugerencia rechazada' };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async assertOrgOwnership(
    type: 'positions' | 'roles' | 'departments',
    id: string,
    orgId: string,
  ) {
    let record: { org_id: string | null } | null = null;

    if (type === 'positions') {
      record = await this.prisma.masterPosition.findUnique({
        where: { id },
        select: { org_id: true },
      });
    } else if (type === 'roles') {
      record = await this.prisma.masterRole.findUnique({
        where: { id },
        select: { org_id: true },
      });
    } else {
      record = await this.prisma.department.findUnique({
        where: { id },
        select: { org_id: true },
      });
    }

    if (!record) {
      throw new NotFoundException('Elemento no encontrado');
    }

    if (record.org_id === null) {
      throw new ForbiddenException(
        'Los registros globales de Kairos no pueden ser modificados',
      );
    }

    if (record.org_id !== orgId) {
      throw new ForbiddenException(
        'No tienes permiso para modificar este elemento',
      );
    }
  }

  private async getCachedList<T>(
    type: string,
    orgId: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const cacheKey = `master:${type}:${orgId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as T;

    const data = await fetcher();
    await this.redis.set(cacheKey, JSON.stringify(data), 300);
    return data;
  }

  private async invalidateCache(
    type: 'positions' | 'roles' | 'departments',
    orgId: string,
  ) {
    await this.redis.del(`master:${type}:${orgId}`);
  }

  private getTypeLabel(type: MasterEntityType): string {
    const labels: Record<MasterEntityType, string> = {
      POSITION: 'cargos',
      ROLE: 'roles operativos',
      DEPARTMENT: 'departamentos',
    };
    return labels[type] ?? type;
  }
}
