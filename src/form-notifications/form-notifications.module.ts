import { Module } from '@nestjs/common';
import { FormNotificationsService } from './form-notifications.service';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';

@Module({
  imports: [PushNotificationsModule],
  providers: [FormNotificationsService],
  exports: [FormNotificationsService],
})
export class FormNotificationsModule {}
