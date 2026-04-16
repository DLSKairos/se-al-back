import { Injectable } from '@nestjs/common';
import { AttendanceConfig } from '@prisma/client';
import { DateTime } from 'luxon';

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
   * IMPORTANTE: Prisma mapea columnas PostgreSQL TIME(6) a objetos Date de JavaScript
   * anclados en 1970-01-01. Si se pasa directamente un entryTime de base de datos
   * junto a un exitTime = new Date(), la diferencia sería ~56 años en lugar de horas,
   * causando un loop de millones de iteraciones que congela el event loop de Node.js.
   * Por eso reconstruimos ambos timestamps sobre service_date antes de calcular.
   */
  calculateOvertime(
    entryTime: Date,
    exitTime: Date,
    serviceDate: Date,
    lunchMinutes: number | null,
    config: AttendanceConfig,
  ): OvertimeResult {
    // Anclar ambos timestamps a service_date en la zona horaria correcta.
    // Esto neutraliza el desajuste de fechas cuando entryTime proviene de un
    // campo TIME(6) de Prisma (anclado en 1970-01-01) y exitTime es new Date().
    //
    // Nota: Prisma lee campos @db.Date como medianoche UTC (e.g. "2026-04-15T00:00:00Z"),
    // lo cual al convertir a Bogotá (UTC-5) daría el día anterior. Extraemos el string
    // de fecha directamente en UTC para evitar ese desfase.
    const dateStr = DateTime.fromJSDate(serviceDate, { zone: 'utc' }).toISODate()!;
    const svcBase = DateTime.fromISO(dateStr, { zone: TIMEZONE }).startOf('day');

    const entryLocal = DateTime.fromJSDate(entryTime).setZone(TIMEZONE);
    const exitLocal  = DateTime.fromJSDate(exitTime).setZone(TIMEZONE);

    const entry = svcBase.set({
      hour:        entryLocal.hour,
      minute:      entryLocal.minute,
      second:      entryLocal.second,
      millisecond: 0,
    });

    let exit = svcBase.set({
      hour:        exitLocal.hour,
      minute:      exitLocal.minute,
      second:      exitLocal.second,
      millisecond: 0,
    });

    // Turno nocturno que cruza medianoche: la salida pertenece al día siguiente
    if (exit <= entry) {
      exit = exit.plus({ days: 1 });
    }

    // 1. Total de minutos trabajados (descontando almuerzo)
    const rawMinutes   = exit.diff(entry, 'minutes').minutes;
    const totalMinutes = Math.max(0, Math.round(rawMinutes) - (lunchMinutes ?? 0));

    // 2. Minutos regulares = mínimo entre trabajados y la jornada estándar
    const standardMinutes = Math.round(config.standard_daily_hours * 60);
    const regularMinutes  = Math.min(totalMinutes, standardMinutes);

    // 3. Minutos extra
    const extraMinutes = Math.max(0, totalMinutes - regularMinutes);

    if (extraMinutes === 0) {
      return {
        totalMinutes,
        regularMinutes,
        extraDayMinutes:     0,
        extraNightMinutes:   0,
        extraSundayMinutes:  0,
        extraHolidayMinutes: 0,
      };
    }

    // 4. Clasificar según tipo de día
    const isSunday  = svcBase.weekday === 7; // luxon: 1=lun … 7=dom
    const isHoliday = this.isHoliday(svcBase, config);

    if (isSunday) {
      return {
        totalMinutes,
        regularMinutes,
        extraDayMinutes:     0,
        extraNightMinutes:   0,
        extraSundayMinutes:  extraMinutes,
        extraHolidayMinutes: 0,
      };
    }

    if (isHoliday) {
      return {
        totalMinutes,
        regularMinutes,
        extraDayMinutes:     0,
        extraNightMinutes:   0,
        extraSundayMinutes:  0,
        extraHolidayMinutes: extraMinutes,
      };
    }

    // 5. Clasificar extras entre diurno y nocturno mediante intersección de intervalos (O(1))
    const { extraDayMinutes, extraNightMinutes } = this.classifyByShift(
      entry,
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
      extraSundayMinutes:  0,
      extraHolidayMinutes: 0,
    };
  }

  // ─── Helpers privados ────────────────────────────────────────────────────────

  private isHoliday(date: DateTime, config: AttendanceConfig): boolean {
    const holidays = config.custom_holidays as string[];
    if (!Array.isArray(holidays) || holidays.length === 0) return false;
    return holidays.includes(date.toISODate()!);
  }

  /**
   * Clasifica los minutos extra entre diurnos y nocturnos usando intersección
   * de intervalos — O(días cubiertos) en lugar del antiguo loop minuto a minuto.
   */
  private classifyByShift(
    entry: DateTime,
    extraMinutes: number,
    standardMinutes: number,
    nightStart: string,
    nightEnd: string,
  ): { extraDayMinutes: number; extraNightMinutes: number } {
    const [nsH, nsM] = nightStart.split(':').map(Number);
    const [neH, neM] = nightEnd.split(':').map(Number);
    const nsTotal = nsH * 60 + nsM;
    const neTotal = neH * 60 + neM;
    const crossesMidnight = nsTotal > neTotal;

    const extraStart = entry.plus({ minutes: standardMinutes });
    const extraEnd   = extraStart.plus({ minutes: extraMinutes });

    const nightCount = this.computeNightOverlap(
      extraStart,
      extraEnd,
      nsTotal,
      neTotal,
      crossesMidnight,
    );

    const extraNightMinutes = Math.min(nightCount, extraMinutes);

    return {
      extraNightMinutes,
      extraDayMinutes: extraMinutes - extraNightMinutes,
    };
  }

  /**
   * Calcula los minutos de solapamiento entre el intervalo [start, end] y la
   * ventana nocturna configurada, manejando el cruce de medianoche y tramos
   * que abarcan varios días calendario.
   */
  private computeNightOverlap(
    start: DateTime,
    end: DateTime,
    nightStartMins: number,
    nightEndMins: number,
    crossesMidnight: boolean,
  ): number {
    let total = 0;
    let day      = start.startOf('day');
    const lastDay = end.startOf('day');

    while (day <= lastDay) {
      const windows: Array<[DateTime, DateTime]> = crossesMidnight
        ? [
            // Tramo vespertino: desde nightStart hasta medianoche
            [day.plus({ minutes: nightStartMins }), day.plus({ days: 1 })],
            // Tramo matutino: desde medianoche hasta nightEnd de ese día
            [day, day.plus({ minutes: nightEndMins })],
          ]
        : [
            [day.plus({ minutes: nightStartMins }), day.plus({ minutes: nightEndMins })],
          ];

      for (const [wStart, wEnd] of windows) {
        const oStart = start > wStart ? start : wStart;
        const oEnd   = end   < wEnd   ? end   : wEnd;
        if (oStart < oEnd) {
          total += Math.round(oEnd.diff(oStart, 'minutes').minutes);
        }
      }

      day = day.plus({ days: 1 });
    }

    return total;
  }
}
