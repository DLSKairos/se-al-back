import { forwardRef, Module } from '@nestjs/common';
import { FormApprovalService } from './form-approval.service';
import { FormApprovalController } from './form-approval.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [FormApprovalController],
  providers: [FormApprovalService],
  exports: [FormApprovalService],
})
export class FormApprovalModule {}
