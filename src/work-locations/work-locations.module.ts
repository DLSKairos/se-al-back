import { Module } from '@nestjs/common';
import { WorkLocationsService } from './work-locations.service';
import { WorkLocationsController } from './work-locations.controller';
import { PlanLimitsGuard } from '../common/guards/plan-limits.guard';

@Module({
  controllers: [WorkLocationsController],
  providers: [WorkLocationsService, PlanLimitsGuard],
  exports: [WorkLocationsService],
})
export class WorkLocationsModule {}
