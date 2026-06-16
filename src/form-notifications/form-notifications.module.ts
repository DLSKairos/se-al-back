import { Module } from '@nestjs/common';
import { FormNotificationsService } from './form-notifications.service';
import { FormNotificationsController } from './form-notifications.controller';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PushNotificationsModule, MailModule],
  controllers: [FormNotificationsController],
  providers: [FormNotificationsService],
  exports: [FormNotificationsService],
})
export class FormNotificationsModule {}
