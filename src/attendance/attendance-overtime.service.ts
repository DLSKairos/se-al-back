import { Injectable } from '@nestjs/common';
import { AttendanceConfig } from '@prisma/client';
import { DateTime, Duration } from 'luxon';

export interface OvertimeResult {
  totalMinutes: number;
  regularMinutes: number;
  extraDayMinutes: number;
  extraNightMinutes: number;
  extraSundayMinutes: number;
  extraHolidayMinutes: number;
}

const TIMEZONE = 'America/Bogota';

@Injectable()
export class AttendanceOvertimeService {
  /**
   * Calcula los minutos regulares y extra clasificados por tipo.
   *
   * @param entryTime  - Hora de entrada (Date)
   * @param exitTime   - Hora de salida (Date)
   * @param serviceDate - Fecha del servicio (Date) — se usa solo para determinar día de semana y festivos
   * @param lunchMinutes - Minutos de almuerzo a descontar (puede ser null)
   * @param config     - Configuración de asistencia de la organización
   */
  calculateOvertime(
    entryTime: Date,
    exitTime: Date,
    serviceDate: Date,
    lunchMinutes: number | null,
    config: AttendanceConfig,
  ): OvertimeResult {
    const entry = DateTime.fromJSDate(entryTime).setZone(TIMEZONE);
    const exit = DateTime.fromJSDate(exitTime).setZone(TIMEZONE);
    const svcDate = DateTime.fromJSDate(serviceDate).setZone(TIMEZONE);

    // 1. Calcular total de minutos trabajados
    const rawMinutes = exit.diff(entry, 'minutes').minutes;
    const totalMinutes = Math.max(
      0,
      Math.round(rawMinutes) - (lunchMinutes ?? 0),
    );

    // 2. Minutos regulares = mínimo entre trabajados y la jornada estándar
    const standardMinutes = Math.round(config.standard_daily_hours * 60);
    const regularMinutes = Math.min(totalMinutes, standardMinutes);

    // 3. Minutos extra
    const extraMinutes = Math.max(0, totalMinutes - regularMinutes);

    if (extraMinutes === 0) {
      return {
        totalMinutes,
        regularMinutes,
        extraDayMinutes: 0,
        extraNightMinutes: 0,
        extraSundayMinutes: 0,
        extraHolidayMinutes: 0,
      };
    }

    // 4. Clasificar extras según día y horario
    const isSunday = svcDate.weekday === 7; // luxon: 1=lun, 7=dom
    const isHoliday = this.isHoliday(svcDate, config);

    if (isSunday) {
      return {
        totalMinutes,
        regularMinutes,
        extraDayMinutes: 0,
        extraNightMinutes: 0,
        extraSundayMinutes: extraMinutes,
        extraHolidayMinutes: 0,
      };
    }

    if (isHoliday) {
      return {
        totalMinutes,
        regularMinutes,
        extraDayMinutes: 0,
        extraNightMinutes: 0,
        extraSundayMinutes: 0,
        extraHolidayMinutes: extraMinutes,
      };
    }

    // 5. Si no es domingo ni festivo, clasificar por tramo nocturno
    const { extraDayMinutes, extraNightMinutes } = this.classifyByShift(
      entry,
      exit,
      extraMinutes,
      standardMinutes,
      config.night_shift_start,
      config.night_shift_end,
    );

    return {
      totalMinutes,
      regularMinutes,
      extraDayMinutes,
      extraNightMinutes,
      extraSundayMinutes: 0,
      extraHolidayMinutes: 0,
    };
  }

  // ─── Helpers privados ──────────────────────────────────────────────────────

  private isHoliday(date: DateTime, config: AttendanceConfig): boolean {
    const holidays = config.custom_holidays as string[];
    if (!Array.isArray(holidays) || holidays.length === 0) return false;
    const dateStr = date.toISODate(); // "YYYY-MM-DD"
    return holidays.includes(dateStr!);
  }

  /**
   * Clasifica los minutos extra entre diurnos y nocturnos.
   * Recorre el turno completo en franjas de 1 minuto a partir del momento
   * en que terminan los minutos regulares, contando cuántos caen en horario nocturno.
   *
   * Enfoque simplificado y preciso: analiza minuto a minuto los tramos extra.
   */
  private classifyByShift(
    entry: DateTime,
    exit: DateTime,
    extraMinutes: number,
    standardMinutes: number,
    nightStart: string,
    nightEnd: string,
  ): { extraDayMinutes: number; extraNightMinutes: number } {
    // El tramo extra comienza cuando termina la jornada regular
    const extraStart = entry.plus(Duration.fromMillis(standardMinutes * 60_000));

    let nightCount = 0;

    for (let i = 0; i < extraMinutes; i++) {
      const moment = extraStart.plus(Duration.fromMillis(i * 60_000));
      if (this.isNightTime(moment, nightStart, nightEnd)) {
        nightCount++;
      }
    }

    return {
      extraNightMinutes: nightCount,
      extraDayMinutes: extraMinutes - nightCount,
    };
  }

  /**
   * Determina si un instante cae en horario nocturno.
   * Maneja el cruce de medianoche: ej. 21:00 → 06:00.
   */
  private isNightTime(
    moment: DateTime,
    nightStart: string,
    nightEnd: string,
  ): boolean {
    const [nsHour, nsMin] = nightStart.split(':').map(Number);
    const [neHour, neMin] = nightEnd.split(':').map(Number);

    const currentMinutes = moment.hour * 60 + moment.minute;
    const startMinutes = nsHour * 60 + nsMin;
    const endMinutes = neHour * 60 + neMin;

    if (startMinutes > endMinutes) {
      // Cruza medianoche: nocturno si >= start O < end
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // No cruza medianoche: nocturno si >= start Y < end
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }
}
