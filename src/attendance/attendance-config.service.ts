import { Injectable, NotFoundException } from '@nestjs/common';
import { AttendanceConfig } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceConfigDto } from './dto/attendance-config.dto';

@Injectable()
export class AttendanceConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getConfig(orgId: string): Promise<AttendanceConfig | null> {
    return this.prisma.attendanceConfig.findUnique({
      where: { org_id: orgId },
    });
  }

  async upsertConfig(
    orgId: string,
    dto: AttendanceConfigDto,
  ): Promise<AttendanceConfig> {
    return this.prisma.attendanceConfig.upsert({
      where: { org_id: orgId },
      update: {
        ...(dto.is_enabled !== undefined && { is_enabled: dto.is_enabled }),
        ...(dto.standard_daily_hours !== undefined && {
          standard_daily_hours: dto.standard_daily_hours,
        }),
        ...(dto.night_shift_start !== undefined && {
          night_shift_start: dto.night_shift_start,
        }),
        ...(dto.night_shift_end !== undefined && {
          night_shift_end: dto.night_shift_end,
        }),
        ...(dto.sunday_surcharge !== undefined && {
          sunday_surcharge: dto.sunday_surcharge,
        }),
        ...(dto.holiday_surcharge !== undefined && {
          holiday_surcharge: dto.holiday_surcharge,
        }),
      },
      create: {
        org_id: orgId,
        is_enabled: dto.is_enabled ?? false,
        standard_daily_hours: dto.standard_daily_hours ?? 8.0,
        night_shift_start: dto.night_shift_start ?? '21:00',
        night_shift_end: dto.night_shift_end ?? '06:00',
        sunday_surcharge: dto.sunday_surcharge ?? true,
        holiday_surcharge: dto.holiday_surcharge ?? true,
        custom_holidays: [],
      },
    });
  }

  async setHolidays(
    orgId: string,
    holidays: string[],
  ): Promise<AttendanceConfig> {
    const config = await this.prisma.attendanceConfig.findUnique({
      where: { org_id: orgId },
    });

    if (!config) {
      throw new NotFoundException(
        'Configuración de asistencia no encontrada para esta organización',
      );
    }

    return this.prisma.attendanceConfig.update({
      where: { org_id: orgId },
      data: { custom_holidays: holidays },
    });
  }
}
