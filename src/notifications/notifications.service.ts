import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateNotificationInput } from './dto/create-notification.dto';
import {
  BulkNotificationTarget,
  CreateBulkNotificationDto,
} from './dto/create-bulk-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { QuerySentNotificationsDto } from './dto/query-sent-notifications.dto';

/** Canal Redis pub/sub para entrega en tiempo real al gateway WebSocket. */
export const NOTIFICATION_CHANNEL = 'notification.created';

/** Tamaño del lote para envíos masivos. */
const BULK_BATCH_SIZE = 50;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  // ─── API PACTADA — consumida por otros módulos ───────────────────────────────

  /**
   * Crea una notificación en BD y publica en Redis pub/sub.
   * API pactada: otros módulos del sprint la invocan directamente.
   */
  async create(input: {
    user_id: string;
    type: NotificationType;
    title: string;
    body: string;
    deep_link?: string;
    created_by_admin_id?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        body: input.body,
        deep_link: input.deep_link ?? null,
        created_by_admin_id: input.created_by_admin_id ?? null,
      },
    });

    // Publicar en el canal para que el gateway WebSocket entregue en tiempo real
    await this.publishCreated(notification.id, input.user_id, notification.type, notification.title);

    return notification;
  }

  // ─── Consultas del usuario autenticado ──────────────────────────────────────

  /**
   * Lista paginada de notificaciones para el usuario autenticado.
   * Opcionalmente filtra solo no leídas.
   * Retorna también unreadCount total.
   */
  async findAllForUser(
    userId: string,
    query: QueryNotificationsDto,
  ) {
    const { unreadOnly = false, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where = {
      user_id: userId,
      ...(unreadOnly ? { read: false } : {}),
    };

    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({
        where: { user_id: userId, read: false },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      unreadCount,
    };
  }

  /**
   * Marca una notificación como leída.
   * Valida ownership: lanza NotFoundException si no pertenece al userId.
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notificación no encontrada');
    }

    if (notification.user_id !== userId) {
      throw new NotFoundException('Notificación no encontrada');
    }

    if (notification.read) {
      return notification;
    }

    return this.prisma.notification.update({
      where: { id },
      data: { read: true, read_at: new Date() },
    });
  }

  /**
   * Marca todas las notificaciones del usuario como leídas.
   */
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { user_id: userId, read: false },
      data: { read: true, read_at: new Date() },
    });

    return { updated: result.count };
  }

  // ─── Envíos masivos por admin ─────────────────────────────────────────────

  /**
   * Crea notificaciones masivas enviadas por un admin.
   * Siempre acotado a la org del admin autenticado (multi-tenant).
   * Procesa en lotes de BULK_BATCH_SIZE para no saturar Redis.
   */
  async createBulkByAdmin(
    adminId: string,
    orgId: string,
    dto: CreateBulkNotificationDto,
  ) {
    const recipients = await this.resolveRecipients(orgId, dto);

    if (recipients.length === 0) {
      return { sent: 0, recipients: [] };
    }

    let sent = 0;

    // Procesar en lotes
    for (let i = 0; i < recipients.length; i += BULK_BATCH_SIZE) {
      const batch = recipients.slice(i, i + BULK_BATCH_SIZE);

      await Promise.all(
        batch.map((userId) =>
          this.create({
            user_id: userId,
            type: NotificationType.CUSTOM_ADMIN,
            title: dto.title,
            body: dto.body,
            deep_link: dto.deep_link,
            created_by_admin_id: adminId,
          }),
        ),
      );

      sent += batch.length;
    }

    this.logger.log(
      `Admin ${adminId} envió notificación masiva a ${sent} usuarios de org ${orgId}`,
    );

    return { sent, recipientCount: recipients.length };
  }

  /**
   * Historial de notificaciones enviadas por admins de la org.
   * Lista plana ordenada por fecha desc, con título, fecha, creador y conteo.
   * La agrupación semántica (un "envío" = N notificaciones) se aproxima buscando
   * la primera notificación de cada "batch": mismo admin + mismo título + misma fecha
   * truncada al minuto.
   */
  async findSentByOrg(
    adminId: string,
    orgId: string,
    query: QuerySentNotificationsDto,
  ) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    // Buscar los admins de la org para delimitar el scope multi-tenant
    const orgAdmins = await this.prisma.user.findMany({
      where: { org_id: orgId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
      select: { id: true },
    });

    const adminIds = orgAdmins.map((u) => u.id);

    const where = {
      created_by_admin_id: { in: adminIds },
      type: NotificationType.CUSTOM_ADMIN,
    };

    // Usamos groupBy vía rawQuery conceptual: tomamos la primera notificación
    // de cada (admin, title) pair ordenado por created_at desc — lista plana.
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          body: true,
          deep_link: true,
          created_at: true,
          created_by_admin_id: true,
          created_by_admin: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);

    // Enriquecer cada fila con el conteo de destinatarios de ese envío.
    // Identificamos un "envío" como mismo admin + mismo título + misma fecha
    // (dentro de ±1 minuto del instante de creación).
    const enriched = await Promise.all(
      items.map(async (item) => {
        const sentAt = item.created_at;
        const windowStart = new Date(sentAt.getTime() - 60_000);
        const windowEnd = new Date(sentAt.getTime() + 60_000);

        const recipientCount = await this.prisma.notification.count({
          where: {
            created_by_admin_id: item.created_by_admin_id,
            title: item.title,
            created_at: { gte: windowStart, lte: windowEnd },
          },
        });
        return { ...item, recipientCount };
      }),
    );

    return {
      items: enriched,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── helpers privados ────────────────────────────────────────────────────────

  /**
   * Resuelve la lista de user_ids destinatarios según target.
   * Siempre acotada a usuarios activos de la org.
   */
  private async resolveRecipients(
    orgId: string,
    dto: CreateBulkNotificationDto,
  ): Promise<string[]> {
    switch (dto.target) {
      case BulkNotificationTarget.ALL: {
        const users = await this.prisma.user.findMany({
          where: { org_id: orgId, is_active: true },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }

      case BulkNotificationTarget.SITE: {
        if (!dto.work_location_id) return [];

        // Verificar que la obra pertenece a la org (seguridad multi-tenant)
        const location = await this.prisma.workLocation.findFirst({
          where: { id: dto.work_location_id, org_id: orgId },
        });

        if (!location) {
          throw new ForbiddenException(
            'La obra especificada no pertenece a tu organización',
          );
        }

        const users = await this.prisma.user.findMany({
          where: {
            work_location_id: dto.work_location_id,
            org_id: orgId,
            is_active: true,
          },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }

      case BulkNotificationTarget.SPECIFIC: {
        if (!dto.user_ids || dto.user_ids.length === 0) return [];

        // Filtrar solo los IDs que pertenezcan a la org (seguridad multi-tenant)
        const users = await this.prisma.user.findMany({
          where: {
            id: { in: dto.user_ids },
            org_id: orgId,
            is_active: true,
          },
          select: { id: true },
        });
        return users.map((u) => u.id);
      }

      default:
        return [];
    }
  }

  /**
   * Publica el evento de notificación creada en el canal Redis pub/sub.
   * El NotificationsGateway escucha este canal y reenvía al room del usuario.
   */
  private async publishCreated(
    notificationId: string,
    userId: string,
    type: NotificationType,
    title: string,
  ): Promise<void> {
    try {
      const payload = JSON.stringify({ notificationId, userId, type, title });
      await this.redis.getClient().publish(NOTIFICATION_CHANNEL, payload);
    } catch (err) {
      // No propagar el error — la notificación ya está en BD
      this.logger.error(
        `Error publicando en Redis canal ${NOTIFICATION_CHANNEL}: ${String(err)}`,
      );
    }
  }
}
