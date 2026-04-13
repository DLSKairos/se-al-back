import { Module } from '@nestjs/common';
import { WorkLocationsService } from './work-locations.service';
import { WorkLocationsController } from './work-locations.controller';

@Module({
  controllers: [WorkLocationsController],
  providers: [WorkLocationsService],
  exports: [WorkLocationsService],
})
export class WorkLocationsModule {}
