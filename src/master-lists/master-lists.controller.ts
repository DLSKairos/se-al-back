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
import { MasterListsService } from './master-lists.service';
import { CreateMasterItemDto } from './dto/create-master-item.dto';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

/**
 * Dos grupos de endpoints:
 * - /master/* — lectura y sugerencias (todos los usuarios autenticados)
 * - /admin/master/* — gestión (solo ADMIN)
 */

// ─── Controlador de lectura y sugerencias ─────────────────────────────────

@Controller('master')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MasterListsPublicController {
  constructor(private readonly masterListsService: MasterListsService) {}

  @Get('positions')
  findPositions(@CurrentUser() user: JwtPayload) {
    return this.masterListsService.findPositions(user.orgId);
  }

  @Get('roles')
  findRoles(@CurrentUser() user: JwtPayload) {
    return this.masterListsService.findRoles(user.orgId);
  }

  @Get('departments')
  findDepartments(@CurrentUser() user: JwtPayload) {
    return this.masterListsService.findDepartments(user.orgId);
  }

  /**
   * Cualquier usuario autenticado puede sugerir un valor.
   */
  @Post('suggestions')
  @HttpCode(HttpStatus.CREATED)
  createSuggestion(
    @Body() dto: CreateSuggestionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.createSuggestion(user.orgId, user.sub, dto);
  }
}

// ─── Controlador de gestión (admin) ───────────────────────────────────────

@Controller('admin/master')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class MasterListsAdminController {
  constructor(private readonly masterListsService: MasterListsService) {}

  @Post('positions')
  @HttpCode(HttpStatus.CREATED)
  createPosition(
    @Body() dto: CreateMasterItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.createPosition(user.orgId, dto);
  }

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  createRole(
    @Body() dto: CreateMasterItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.createRole(user.orgId, dto);
  }

  @Post('departments')
  @HttpCode(HttpStatus.CREATED)
  createDepartment(
    @Body() dto: CreateMasterItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.createDepartment(user.orgId, dto);
  }

  /**
   * Editar nombre de un elemento. Solo registros propios de la org.
   */
  @Patch(':type/:id')
  updateItem(
    @Param('type') type: 'positions' | 'roles' | 'departments',
    @Param('id') id: string,
    @Body() dto: CreateMasterItemDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.updateItem(type, id, user.orgId, dto);
  }

  /**
   * Soft delete. Solo registros propios de la org (los globales → 403).
   */
  @Patch(':type/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivateItem(
    @Param('type') type: 'positions' | 'roles' | 'departments',
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.deactivateItem(type, id, user.orgId);
  }

  /**
   * Lista sugerencias pendientes de la org.
   */
  @Get('suggestions')
  findSuggestions(@CurrentUser() user: JwtPayload) {
    return this.masterListsService.findPendingSuggestions(user.orgId);
  }

  /**
   * Aprueba una sugerencia → crea el registro en la lista maestra + notifica al sugerente.
   */
  @Patch('suggestions/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.approveSuggestion(id, user.orgId, user.sub);
  }

  /**
   * Rechaza una sugerencia.
   */
  @Patch('suggestions/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectSuggestion(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.masterListsService.rejectSuggestion(id, user.orgId, user.sub);
  }
}
