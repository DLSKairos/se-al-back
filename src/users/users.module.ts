import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';
import { PlanLimitsGuard } from '../common/guards/plan-limits.guard';

@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService, PlanLimitsGuard],
  exports: [UsersService],
})
export class UsersModule {}
