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
   * Exporta el reporte a Excel (descarga directa).
   * NOTE: cuando el service de exportación de asistencia esté implementado,
   * reemplazar por attendanceService.exportReport(user.orgId, query).
   */
  @Roles('ADMIN')
  @Get('report/export')
  async reportExport(
    @Query() query: AttendanceReportQueryDto,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: false }) res: Response,
  ) {
    // Placeholder hasta que attendanceService.exportReport esté implementado
    const records = await this.attendanceService.findAll(user.orgId, query);
    const filename = `asistencia-${new Date().toISOString().slice(0, 10)}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(records));
  }
}
