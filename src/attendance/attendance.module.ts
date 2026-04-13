import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceOvertimeService } from './attendance-overtime.service';
import { AttendanceCronService } from './attendance-cron.service';
import { AttendanceConfigService } from './attendance-config.service';

@Module({
  controllers: [AttendanceController],
  providers: [
    AttendanceService,
    AttendanceOvertimeService,
    AttendanceCronService,
    AttendanceConfigService,
  ],
  exports: [AttendanceService, AttendanceConfigService],
})
export class AttendanceModule {}
