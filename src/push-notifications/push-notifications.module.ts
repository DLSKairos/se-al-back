import { Module } from '@nestjs/common';
import { PushNotificationsService } from './push-notifications.service';
import { PushNotificationsController } from './push-notifications.controller';
import { PushCronService } from './push-cron.service';

@Module({
  controllers: [PushNotificationsController],
  providers: [PushNotificationsService, PushCronService],
  exports: [PushNotificationsService],
})
export class PushNotificationsModule {}
