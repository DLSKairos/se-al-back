import { Module } from '@nestjs/common';
import { FormSubmissionsService } from './form-submissions.service';
import { FormSubmissionsController } from './form-submissions.controller';
import { FormValidityService } from './form-validity.service';
import { FormNotificationsModule } from '../form-notifications/form-notifications.module';

@Module({
  imports: [FormNotificationsModule],
  controllers: [FormSubmissionsController],
  providers: [FormSubmissionsService, FormValidityService],
  exports: [FormSubmissionsService],
})
export class FormSubmissionsModule {}
