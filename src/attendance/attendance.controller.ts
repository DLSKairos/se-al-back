import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { AttendanceService } from './attendance.service';
import { AttendanceConfigService } from './attendance-config.service';
import { EntryAttendanceDto } from './dto/entry-attendance.dto';
import { ExitAttendanceDto } from './dto/exit-attendance.dto';
import { AttendanceConfigDto, SetHolidaysDto } from './dto/attendance-config.dto';
import { AttendanceReportQueryDto } from './dto/attendance-report-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendanceConfigService: AttendanceConfigService,
  ) {}

  // ─── Configuración ────────────────────────────────────────

  /**
   * Obtiene la configuración de asistencia de la organización.
   */
  @Roles('ADMIN')
  @Get('config')
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.attendanceConfigService.getConfig(user.orgId);
  }

  /**
   * Crea o actualiza la configuración de asistencia (upsert).
   */
  @Roles('ADMIN')
  @Patch('config')
  updateConfig(
    @Body() dto: AttendanceConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceConfigService.upsertConfig(user.orgId, dto);
  }

  /**
   * Establece los feriados personalizados de la organización.
   */
  @Roles('ADMIN')
  @Post('config/holidays')
  setHolidays(
    @Body() dto: SetHolidaysDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceConfigService.setHolidays(user.orgId, dto.holidays);
  }

  // ─── Operaciones del empleado ─────────────────────────────

  /**
   * Registra la entrada del usuario autenticado.
   */
  @Post('entry')
  entry(
    @Body() dto: EntryAttendanceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceService.registerEntry(user.sub, user.orgId, dto.work_location_id);
  }

  /**
   * Registra la salida del usuario autenticado.
   */
  @Post('exit')
  exit(
    @Body() dto: ExitAttendanceDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceService.registerExit(user.sub, user.orgId, dto.lunch_minutes);
  }

  /**
   * Devuelve el registro de asistencia del día actual del usuario.
   */
  @Get('today')
  getToday(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.getTodayStatus(user.sub, user.orgId);
  }

  // ─── Operaciones de administración ───────────────────────

  /**
   * Lista registros de asistencia con filtros y paginación.
   */
  @Roles('ADMIN')
  @Get()
  findAll(
    @Query() query: AttendanceReportQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceService.findAll(user.orgId, query);
  }

  /**
   * Retorna los registros abiertos (sin salida) del día.
   */
  @Roles('ADMIN')
  @Get('open')
  findOpen(@CurrentUser() user: JwtPayload) {
    return this.attendanceService.findOpen(user.orgId);
  }

  /**
   * Cierra manualmente todas las jornadas abiertas de una fecha.
   * Si no se provee date, usa hoy.
   */
  @Roles('ADMIN')
  @Post('close-day')
  closeDay(
    @Body('date') date: string | undefined,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceService.closeDay(user.orgId, date);
  }

  // ─── Reportes ─────────────────────────────────────────────

  /**
   * Reporte diario de asistencia.
   */
  @Roles('ADMIN')
  @Get('report/daily')
  reportDaily(
    @Query() query: AttendanceReportQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceService.findAll(user.orgId, query);
  }

  /**
   * Reporte semanal de asistencia.
   */
  @Roles('ADMIN')
  @Get('report/weekly')
  reportWeekly(
    @Query() query: AttendanceReportQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceService.findAll(user.orgId, query);
  }

  /**
   * Reporte mensual de asistencia.
   */
  @Roles('ADMIN')
  @Get('report/monthly')
  reportMonthly(
    @Query() query: AttendanceReportQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.attendanceService.findAll(user.orgId, query);
  }

  /**
   * Exporta el reporte de asistencia a Excel (.xlsx) con desglose de horas extras.
   * Query params: from, to, user_id (todos opcionales).
   */
  @Roles('ADMIN')
  @Get('report/export')
  async reportExport(
    @Query() query: AttendanceReportQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: false }) res: Response,
  ) {
    const result = await this.attendanceService.findAll(user.orgId, {
      ...query,
      limit: 10000, // sin paginación para exportar todo
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ExcelJS = require('exceljs') as typeof import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Asistencia');

    sheet.columns = [
      { header: 'Trabajador', key: 'worker', width: 30 },
      { header: 'Fecha', key: 'date', width: 14 },
      { header: 'Entrada', key: 'entry', width: 10 },
      { header: 'Salida', key: 'exit', width: 10 },
      { header: 'Ubicación', key: 'location', width: 25 },
      { header: 'H. Regulares (min)', key: 'regular', width: 20 },
      { header: 'Extra Diurna (min)', key: 'extra_day', width: 20 },
      { header: 'Extra Nocturna (min)', key: 'extra_night', width: 22 },
      { header: 'Extra Dominical (min)', key: 'extra_sunday', width: 22 },
      { header: 'Extra Festiva (min)', key: 'extra_holiday', width: 22 },
    ];

    // Estilo de cabecera
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A5F' },
    };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const records: any[] = Array.isArray(result)
      ? result
      : (result as any).data ?? [];

    for (const r of records) {
      const toTime = (d: Date | null) =>
        d ? new Date(d).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Bogota' }) : '—';

      sheet.addRow({
        worker: r.user?.name ?? r.user_id,
        date: r.service_date
          ? new Date(r.service_date).toLocaleDateString('es-CO', { timeZone: 'America/Bogota' })
          : '—',
        entry: toTime(r.entry_time),
        exit: toTime(r.exit_time),
        location: r.work_location?.name ?? '—',
        regular: r.regular_minutes ?? 0,
        extra_day: r.extra_day_minutes ?? 0,
        extra_night: r.extra_night_minutes ?? 0,
        extra_sunday: r.extra_sunday_minutes ?? 0,
        extra_holiday: r.extra_holiday_minutes ?? 0,
      });
    }

    const filename = `asistencia-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  }
}
