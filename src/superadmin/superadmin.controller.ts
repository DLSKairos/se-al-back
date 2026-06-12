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
import { SuperadminService } from './superadmin.service';
import { UpdateOrgConfigDto } from './dto/update-org-config.dto';
import { FirstAdminLinkDto } from './dto/first-admin-link.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

/**
 * Todos los endpoints requieren rol SUPER_ADMIN.
 */
@Controller('superadmin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  /**
   * Lista organizaciones con plan, conteos y límites.
   */
  @Get('organizations')
  findAllOrganizations() {
    return this.superadminService.findAllOrganizations();
  }

  /**
   * Detalle de una organización con su OrgConfig.
   */
  @Get('organizations/:id')
  findOneOrganization(@Param('id') id: string) {
    return this.superadminService.findOneOrganization(id);
  }

  /**
   * Actualiza (upsert) el OrgConfig de una organización.
   * Invalida caché de org-config:{id} en Redis.
   */
  @Patch('organizations/:id/config')
  @HttpCode(HttpStatus.OK)
  upsertConfig(
    @Param('id') id: string,
    @Body() dto: UpdateOrgConfigDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superadminService.upsertOrgConfig(id, user.sub, dto);
  }

  /**
   * Lista los administradores de una organización (para asignar magic links).
   */
  @Get('organizations/:id/administrators')
  findAdministrators(@Param('id') id: string) {
    return this.superadminService.findAdministrators(id);
  }

  /**
   * Métricas de uso: usuarios activos vs máximo, sedes activas vs máximo.
   * Cacheado en Redis TTL 60s.
   */
  @Get('organizations/:id/usage')
  getUsage(@Param('id') id: string) {
    return this.superadminService.getUsage(id);
  }

  /**
   * Genera magic link de primer acceso para el admin de una organización.
   * Valida que el userId pertenece a la org.
   */
  @Post('organizations/:id/first-admin-link')
  @HttpCode(HttpStatus.CREATED)
  generateFirstAdminLink(
    @Param('id') orgId: string,
    @Body() dto: FirstAdminLinkDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.superadminService.generateFirstAdminLink(orgId, user.sub, dto.userId);
  }
}
