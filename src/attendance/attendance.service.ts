import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AttendanceConfigService } from './attendance-config.service';
import { AttendanceOvertimeService } from './attendance-overtime.service';
import { AttendanceReportQueryDto } from './dto/attendance-report-query.dto';

const TIMEZONE = 'America/Bogota';
const LOCK_TTL_SECONDS = 10;
/** Duración asumida para cierre automático: 7 horas y 20 minutos */
const AUTO_CLOSE_MINUTES = 7 * 60 + 20;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly configService: AttendanceConfigService,
    private readonly overtimeService: AttendanceOvertimeService,
  ) {}

  // ─── Registro de entrada ───────────────────────────────────────────────────

  async registerEntry(
    userId: string,
    orgId: string,
    workLocationId?: string,
  ) {
    const today = DateTime.now().setZone(TIMEZONE);
    const dateStr = today.toISODate()!;
    const lockKey = `attendance:lock:${userId}:${dateStr}`;

    // Adquirir lock distribuido con NX (solo si no existe)
    const client = this.redis.getClient();
    const acquired = await client.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');

    if (!acquired) {
      throw new ConflictException('Entrada en proceso — intente nuevamente');
    }

    try {
      // Verificar que el módulo de asistencia esté habilitado para la org
      const config = await this.configService.getConfig(orgId);
      if (!config || !config.is_enabled) {
        throw new ConflictException(
          'El módulo de asistencia no está habilitado para esta organización',
        );
      }

      // Verificar que no haya un registro abierto para hoy
      const serviceDate = today.startOf('day').toJSDate();
      const existing = await this.prisma.attendanceRecord.findFirst({
        where: {
          user_id: userId,
          org_id: orgId,
          service_date: serviceDate,
          exit_time: null,
        },
      });

      if (existing) {
        throw new ConflictException(
          'Ya existe una entrada abierta para el día de hoy',
        );
      }

      const now = new Date();

      return await this.prisma.attendanceRecord.create({
        data: {
          org_id: orgId,
          user_id: userId,
          work_location_id: workLocationId ?? null,
          service_date: serviceDate,
          entry_time: now,
        },
      });
    } finally {
      // Liberar el lock siempre, incluso si hubo error
      await this.redis.del(lockKey);
    }
  }

  // ─── Registro de salida ────────────────────────────────────────────────────

  async registerExit(
    userId: string,
    orgId: string,
    lunchMinutes?: number,
  ) {
    const today = DateTime.now().setZone(TIMEZONE);
    const serviceDate = today.startOf('day').toJSDate();

    const record = await this.prisma.attendanceRecord.findFirst({
      where: {
        user_id: userId,
        org_id: orgId,
        service_date: serviceDate,
        exit_time: null,
      },
    });

    if (!record) {
      throw new NotFoundException(
        'No se encontró una entrada abierta para el día de hoy',
      );
    }

    const config = await this.configService.getConfig(orgId);
    if (!config) {
      throw new NotFoundException(
        'Configuración de asistencia no encontrada para esta organización',
      );
    }

    const exitTime = new Date();
    const overtime = this.overtimeService.calculateOvertime(
      record.entry_time,
      exitTime,
      record.service_date,
      lunchMinutes ?? record.lunch_minutes ?? null,
      config,
    );

    return this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: {
        exit_time: exitTime,
        lunch_minutes: lunchMinutes ?? record.lunch_minutes,
        total_minutes: overtime.totalMinutes,
        regular_minutes: overtime.regularMinutes,
        extra_day_minutes: overtime.extraDayMinutes,
        extra_night_minutes: overtime.extraNightMinutes,
        extra_sunday_minutes: overtime.extraSundayMinutes,
        extra_holiday_minutes: overtime.extraHolidayMinutes,
      },
    });
  }

  // ─── Consultas ─────────────────────────────────────────────────────────────

  async getTodayStatus(userId: string, orgId: string) {
    const today = DateTime.now().setZone(TIMEZONE);
    const serviceDate = today.startOf('day').toJSDate();

    return this.prisma.attendanceRecord.findFirst({
      where: { user_id: userId, org_id: orgId, service_date: serviceDate },
      include: { work_location: true },
    });
  }

  async findAll(orgId: string, query: AttendanceReportQueryDto) {
    const where: Record<string, unknown> = { org_id: orgId };

    if (query.user_id) {
      where['user_id'] = query.user_id;
    }

    if (query.work_location_id) {
      where['work_location_id'] = query.work_location_id;
    }

    if (query.from || query.to) {
      where['service_date'] = {
        ...(query.from && { gte: new Date(query.from) }),
        ...(query.to && { lte: new Date(query.to) }),
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.attendanceRecord.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, identification_number: true } },
          work_location: { select: { id: true, name: true } },
        },
        orderBy: { service_date: 'desc' },
        take: limit,
        skip,
      }),
      this.prisma.attendanceRecord.count({ where }),
    ]);

    return { data, total };
  }

  async findOpen(orgId: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { org_id: orgId, exit_time: null },
      include: {
        user: { select: { id: true, name: true, identification_number: true } },
        work_location: { select: { id: true, name: true } },
      },
      orderBy: { service_date: 'desc' },
    });
  }

  // ─── Cierre de jornada ─────────────────────────────────────────────────────

  async closeDay(orgId: string, date?: string): Promise<number> {
    const config = await this.configService.getConfig(orgId);
    if (!config) return 0;

    const targetDate = date
      ? DateTime.fromISO(date, { zone: TIMEZONE }).startOf('day').toJSDate()
      : DateTime.now().setZone(TIMEZONE).startOf('day').toJSDate();

    const openRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        org_id: orgId,
        service_date: targetDate,
        exit_time: null,
      },
    });

    let closed = 0;

    for (const record of openRecords) {
      const entryTime = record.entry_time;
      // Salida automática = entrada + 7h20min
      const exitTime = new Date(
        entryTime.getTime() + AUTO_CLOSE_MINUTES * 60_000,
      );

      const overtime = this.overtimeService.calculateOvertime(
        entryTime,
        exitTime,
        record.service_date,
        record.lunch_minutes,
        config,
      );

      await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          exit_time: exitTime,
          total_minutes: overtime.totalMinutes,
          regular_minutes: overtime.regularMinutes,
          extra_day_minutes: overtime.extraDayMinutes,
          extra_night_minutes: overtime.extraNightMinutes,
          extra_sunday_minutes: overtime.extraSundayMinutes,
          extra_holiday_minutes: overtime.extraHolidayMinutes,
        },
      });

      closed++;
    }

    return closed;
  }
}
