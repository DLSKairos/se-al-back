import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AdminManagementService } from './admin-management.service';
import { CreateAdminDto } from './dto/create-admin.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlanLimitsGuard } from '../common/guards/plan-limits.guard';
import { PlanLimitResource } from '../common/decorators/plan-limit-resource.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('admin/administrators')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AdminManagementController {
  constructor(private readonly adminManagementService: AdminManagementService) {}

  /**
   * Lista administradores de la organización con estado de activación.
   */
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.adminManagementService.findAdmins(user.orgId);
  }

  /**
   * Crea un nuevo administrador.
   * PlanLimitsGuard verifica el límite de usuarios antes de crear.
   * Genera magic link de invitación automáticamente.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(PlanLimitsGuard)
  @PlanLimitResource('users')
  create(
    @Body() dto: CreateAdminDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminManagementService.createAdmin(user.orgId, user.sub, dto);
  }

  /**
   * Desactiva un administrador (soft delete).
   * Un admin no puede desactivarse a sí mismo.
   */
  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminManagementService.deactivateAdmin(id, user.orgId, user.sub);
  }

  /**
   * Reactiva un administrador.
   * Si no tiene OAuth vinculado, genera un nuevo magic link de invitación.
   */
  @Patch(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminManagementService.reactivateAdmin(id, user.orgId, user.sub);
  }
}
