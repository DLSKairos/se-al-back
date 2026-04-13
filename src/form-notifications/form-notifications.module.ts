import { Module } from '@nestjs/common';
import { FormNotificationsService } from './form-notifications.service';
import { FormNotificationsController } from './form-notifications.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PushNotificationsModule],
  controllers: [FormNotificationsController],
  providers: [FormNotificationsService],
  exports: [FormNotificationsService],
})
export class FormNotificationsModule {}
