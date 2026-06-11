import { Module } from '@nestjs/common';
import { AdminManagementService } from './admin-management.service';
import { AdminManagementController } from './admin-management.controller';
import { MagicLinkModule } from '../magic-link/magic-link.module';

@Module({
  imports: [MagicLinkModule],
  controllers: [AdminManagementController],
  providers: [AdminManagementService],
  exports: [AdminManagementService],
})
export class AdminManagementModule {}
