import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PushNotificationsService } from './push-notifications.service';

/**
 * Mensajes genéricos de las notificaciones programadas.
 * Se pueden personalizar por org en el futuro sin cambiar la lógica.
 */
const PUSH_MESSAGES = {
  morning: {
    title: 'Inicio de jornada',
    body: 'Buenos días. Recuerda registrar tu entrada al comenzar.',
  },
  midMorning: {
    title: 'Recordatorio matutino',
    body: 'No olvides completar tus registros y formularios pendientes.',
  },
  afternoon: {
    title: 'Seguimiento de tarde',
    body: 'Verifica que tus registros del día estén al día.',
  },
  lateAfternoon: {
    title: 'Avance del día',
    body: 'Estás a pocas horas de cerrar la jornada. ¡Buen trabajo!',
  },
  endOfDay: {
    title: 'Cierre de jornada',
    body: 'Recuerda registrar tu salida antes de terminar.',
  },
  pendingForms: {
    title: 'Formularios pendientes',
    body: 'Tienes formularios sin completar hoy. Revísalos antes de finalizar.',
  },
};

@Injectable()
export class PushCronService {
  private readonly logger = new Logger(PushCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pushService: PushNotificationsService,
    private readonly redis: RedisService,
  ) {}

  /** 06:30 — Inicio de jornada */
  @Cron('30 6 * * *', { timeZone: 'America/Bogota' })
  async morningNotification(): Promise<void> {
    await this.broadcastToAllUsers('morning', PUSH_MESSAGES.morning);
  }

  /** 10:00 — Recordatorio matutino */
  @Cron('0 10 * * *', { timeZone: 'America/Bogota' })
  async midMorningNotification(): Promise<void> {
    await this.broadcastToAllUsers('midMorning', PUSH_MESSAGES.midMorning);
  }

  /** 14:00 — Seguimiento de tarde */
  @Cron('0 14 * * *', { timeZone: 'America/Bogota' })
  async afternoonNotification(): Promise<void> {
    await this.broadcastToAllUsers('afternoon', PUSH_MESSAGES.afternoon);
  }

  /** 15:25 — Avance del día */
  @Cron('25 15 * * *', { timeZone: 'America/Bogota' })
  async lateAfternoonNotification(): Promise<void> {
    await this.broadcastToAllUsers('lateAfternoon', PUSH_MESSAGES.lateAfternoon);
  }

  /** 17:00 — Cierre de jornada */
  @Cron('0 17 * * *', { timeZone: 'America/Bogota' })
  async endOfDayNotification(): Promise<void> {
    await this.broadcastToAllUsers('endOfDay', PUSH_MESSAGES.endOfDay);
  }

  /** 16:00 — Formularios pendientes del día */
  @Cron('0 16 * * *', { timeZone: 'America/Bogota' })
  async pendingFormsNotification(): Promise<void> {
    await this.broadcastToAllUsers('pendingForms', PUSH_MESSAGES.pendingForms);
  }

  /**
   * Envía una notificación push a todos los usuarios con suscripción activa.
   * Fire-and-forget por usuario — un fallo no detiene al siguiente.
   */
  private async broadcastToAllUsers(
    jobName: string,
    message: { title: string; body: string },
  ): Promise<void> {
    // Con varias instancias, solo una ejecuta cada job (lock por job y día, hora Bogotá)
    const day = DateTime.now().setZone('America/Bogota').toFormat('yyyy-MM-dd');
    if (!(await this.redis.tryLock(`cron:push:${jobName}:${day}`, 23 * 3600))) {
      this.logger.log(`[PushCron] "${jobName}" ya ejecutado por otra instancia — omitiendo`);
      return;
    }

    const subscriptions = await this.prisma.pushSubscription.findMany({
      select: { user_id: true },
    });

    this.logger.log(
      `[PushCron] Enviando "${message.title}" a ${subscriptions.length} suscriptores`,
    );

    await Promise.allSettled(
      subscriptions.map(({ user_id }) =>
        this.pushService.sendToUser(user_id, message),
      ),
    );
  }
}
