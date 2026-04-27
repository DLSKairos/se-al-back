import { AttendanceOvertimeService } from './attendance-overtime.service';
import { AttendanceConfig } from '@prisma/client';

// ─── Helpers internos del test ────────────────────────────────────────────────

/**
 * Crea un Date anclado en 1970-01-01 con la hora en UTC, simulando cómo
 * Prisma devuelve columnas TIME(6). El servicio extrae hour/minute en Bogota,
 * pero como los tests usan fechas en 1970 UTC, la hora Bogota = hora UTC - 5.
 * Para testear un turno "HH:MM en Bogota", debemos pasar HH+5 en UTC.
 * Por ejemplo, para simular "08:00 Bogota" pasamos "13:00 UTC".
 */
function makeTimeBogota(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  // Convertir de Bogota (UTC-5) a UTC sumando 5 horas
  const utcH = (h + 5) % 24;
  return new Date(`1970-01-01T${String(utcH).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
}

function makeDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

// ─── Config de referencia ─────────────────────────────────────────────────────

function makeConfig(overrides: Partial<AttendanceConfig> = {}): AttendanceConfig {
  return {
    id: 'config-1',
    org_id: 'org-1',
    is_enabled: true,
    standard_daily_hours: 8,
    night_shift_start: '21:00',
    night_shift_end: '06:00',
    sunday_surcharge: true,
    holiday_surcharge: true,
    custom_holidays: [],
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  } as AttendanceConfig;
}

describe('AttendanceOvertimeService', () => {
  let service: AttendanceOvertimeService;

  beforeEach(() => {
    service = new AttendanceOvertimeService();
  });

  // ─── Caso base ─────────────────────────────────────────────────────────────

  it('should return zero extra minutes for exactly 8h shift on Tuesday', () => {
    // Martes 2026-04-21 (weekday=2 en luxon → no es domingo)
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('16:00');
    const date = makeDate('2026-04-21');
    const config = makeConfig();

    const result = service.calculateOvertime(entry, exit, date, null, config);

    expect(result.totalMinutes).toBe(480);
    expect(result.regularMinutes).toBe(480);
    expect(result.extraDayMinutes).toBe(0);
    expect(result.extraNightMinutes).toBe(0);
    expect(result.extraSundayMinutes).toBe(0);
    expect(result.extraHolidayMinutes).toBe(0);
  });

  // ─── Hora extra diurna ──────────────────────────────────────────────────────

  it('should return 60 extraDayMinutes for 9h shift on Tuesday', () => {
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('17:00');
    const date = makeDate('2026-04-21');
    const config = makeConfig();

    const result = service.calculateOvertime(entry, exit, date, null, config);

    expect(result.totalMinutes).toBe(540);
    expect(result.regularMinutes).toBe(480);
    expect(result.extraDayMinutes).toBe(60);
    expect(result.extraNightMinutes).toBe(0);
    expect(result.extraSundayMinutes).toBe(0);
    expect(result.extraHolidayMinutes).toBe(0);
  });

  // ─── Turno largo con extras diurno y nocturno ───────────────────────────────

  it('should split extra minutes into extraDayMinutes and extraNightMinutes for 08:00-22:00 shift', () => {
    // 08:00 → 22:00 = 14h = 840min total
    // regular = 480 (8h estándar)
    // extra = 360min (16:00-22:00)
    // nocturno arranca a 21:00 → extra nocturno = 60min (21:00-22:00)
    // extra diurno = 300min (16:00-21:00)
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('22:00');
    const date = makeDate('2026-04-21'); // martes
    const config = makeConfig();

    const result = service.calculateOvertime(entry, exit, date, null, config);

    expect(result.totalMinutes).toBe(840);
    expect(result.regularMinutes).toBe(480);
    // Total de extras: 360min (diurno + nocturno)
    expect(result.extraDayMinutes + result.extraNightMinutes).toBe(360);
    // El tramo nocturno 21:00-22:00 = 60min
    expect(result.extraNightMinutes).toBe(60);
    // El tramo diurno 16:00-21:00 = 300min
    expect(result.extraDayMinutes).toBe(300);
    expect(result.extraSundayMinutes).toBe(0);
    expect(result.extraHolidayMinutes).toBe(0);
  });

  // ─── Almuerzo ──────────────────────────────────────────────────────────────

  it('should reduce totalMinutes by lunchMinutes', () => {
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('17:00'); // 9h = 540min brutos
    const date = makeDate('2026-04-21');
    const config = makeConfig();

    const result = service.calculateOvertime(entry, exit, date, 60, config);

    // 540 - 60 = 480min total → sin extras
    expect(result.totalMinutes).toBe(480);
    expect(result.regularMinutes).toBe(480);
    expect(result.extraDayMinutes).toBe(0);
    expect(result.extraNightMinutes).toBe(0);
  });

  // ─── Turno que cruza medianoche ─────────────────────────────────────────────

  it('should handle overnight shift (22:00 to 06:00 next day) without absurd total', () => {
    const entry = makeTimeBogota('22:00');
    const exit = makeTimeBogota('06:00'); // next day por lógica del servicio
    const date = makeDate('2026-04-21');
    const config = makeConfig();

    const result = service.calculateOvertime(entry, exit, date, null, config);

    // 22:00 → 06:00 = 8h = 480min → no absurdo
    expect(result.totalMinutes).toBeLessThan(1000);
    expect(result.totalMinutes).toBeGreaterThan(0);
  });

  // ─── Domingo ──────────────────────────────────────────────────────────────

  it('should assign all extra minutes to extraSundayMinutes on Sunday', () => {
    // Domingo 2026-04-19 (luxon weekday=7)
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('17:00'); // 9h, 60min extra
    const date = makeDate('2026-04-19');
    const config = makeConfig();

    const result = service.calculateOvertime(entry, exit, date, null, config);

    expect(result.extraSundayMinutes).toBe(60);
    expect(result.extraDayMinutes).toBe(0);
    expect(result.extraNightMinutes).toBe(0);
    expect(result.extraHolidayMinutes).toBe(0);
  });

  // ─── Festivo ───────────────────────────────────────────────────────────────

  it('should assign all extra minutes to extraHolidayMinutes on custom holiday', () => {
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('17:00'); // 60min extra
    const date = makeDate('2026-05-01'); // Día del Trabajo
    const config = makeConfig({ custom_holidays: ['2026-05-01'] });

    const result = service.calculateOvertime(entry, exit, date, null, config);

    expect(result.extraHolidayMinutes).toBe(60);
    expect(result.extraDayMinutes).toBe(0);
    expect(result.extraNightMinutes).toBe(0);
    expect(result.extraSundayMinutes).toBe(0);
  });

  // ─── Bug Prisma TIME(6) ────────────────────────────────────────────────────

  it('should not produce absurd totalMinutes when entryTime is anchored in 1970 and serviceDate is 2026', () => {
    // Simula el bug: Prisma devuelve TIME como Date anclada en 1970
    const entry = new Date('1970-01-01T08:00:00Z'); // entrada Prisma TIME(6)
    const exit = new Date('1970-01-01T16:00:00Z');  // salida también en 1970
    const date = makeDate('2026-04-15');             // service_date real en 2026
    const config = makeConfig();

    const result = service.calculateOvertime(entry, exit, date, null, config);

    // El servicio reconstruye los timestamps sobre service_date → debe ser 480min
    expect(result.totalMinutes).toBeLessThan(1000);
    expect(result.totalMinutes).toBe(480);
  });

  // ─── Config no estándar ────────────────────────────────────────────────────

  it('should use standard_daily_hours=4 as regularMinutes cap', () => {
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('13:00'); // 5h = 300min
    const date = makeDate('2026-04-21');
    const config = makeConfig({ standard_daily_hours: 4 });

    const result = service.calculateOvertime(entry, exit, date, null, config);

    // regular = min(300, 240) = 240
    // extra = 60
    expect(result.regularMinutes).toBe(240);
    expect(result.totalMinutes).toBe(300);
    expect(result.extraDayMinutes).toBe(60);
  });

  it('should return zero extra when worked exactly standard_daily_hours=4', () => {
    const entry = makeTimeBogota('08:00');
    const exit = makeTimeBogota('12:00'); // 4h = 240min
    const date = makeDate('2026-04-21');
    const config = makeConfig({ standard_daily_hours: 4 });

    const result = service.calculateOvertime(entry, exit, date, null, config);

    expect(result.regularMinutes).toBe(240);
    expect(result.totalMinutes).toBe(240);
    expect(result.extraDayMinutes).toBe(0);
    expect(result.extraNightMinutes).toBe(0);
  });
});
