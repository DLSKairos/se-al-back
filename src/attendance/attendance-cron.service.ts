import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AttendanceService } from './attendance.service';

const CRON_LOCK_KEY = 'cron:attendance:autoclose';
const CRON_LOCK_TTL = 86400; // 24 horas

@Injectable()
export class AttendanceCronService {
  private readonly logger = new Logger(AttendanceCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Ejecuta a la 01:00 (Colombia) para cerrar jornadas sin salida registrada
   * del día anterior. El lock de Redis garantiza ejecución única en instancias paralelas.
   */
  @Cron('0 1 * * *', { timeZone: 'America/Bogota' })
  async autoCloseShifts(): Promise<void> {
    const client = this.redis.getClient();

    // Adquirir lock: solo una instancia ejecuta por día
    const acquired = await client.set(
      CRON_LOCK_KEY,
      '1',
      'EX',
      CRON_LOCK_TTL,
      'NX',
    );

    if (!acquired) {
      this.logger.log('[Cron] Cierre automático ya ejecutado hoy — omitiendo');
      return;
    }

    this.logger.log('[Cron] Iniciando cierre automático de jornadas...');

    try {
      // Obtener todas las organizaciones con asistencia habilitada
      const orgsWithAttendance = await this.prisma.attendanceConfig.findMany({
        where: { is_enabled: true },
        select: { org_id: true },
      });

      let totalClosed = 0;

      for (const { org_id } of orgsWithAttendance) {
        try {
          const closed = await this.attendanceService.closeDay(org_id);
          totalClosed += closed;

          if (closed > 0) {
            this.logger.log(
              `[Cron] Org ${org_id}: ${closed} jornadas cerradas automáticamente`,
            );
          }
        } catch (err) {
          this.logger.error(
            `[Cron] Error procesando org ${org_id}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(
        `[Cron] Cierre automático finalizado. Total: ${totalClosed} jornadas cerradas en ${orgsWithAttendance.length} organizaciones`,
      );
    } catch (err) {
      this.logger.error(
        `[Cron] Error crítico en cierre automático: ${(err as Error).message}`,
      );
    }
  }
}
