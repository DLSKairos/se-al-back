import { forwardRef, Module } from '@nestjs/common';
import { MasterListsService } from './master-lists.service';
import {
  MasterListsAdminController,
  MasterListsPublicController,
} from './master-lists.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [forwardRef(() => NotificationsModule)],
  controllers: [MasterListsPublicController, MasterListsAdminController],
  providers: [MasterListsService],
  exports: [MasterListsService],
})
export class MasterListsModule {}
