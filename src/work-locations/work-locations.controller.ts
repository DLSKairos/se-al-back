import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { WorkLocationsService } from './work-locations.service';
import { CreateWorkLocationDto } from './dto/create-work-location.dto';
import { UpdateWorkLocationDto } from './dto/update-work-location.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('work-locations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WorkLocationsController {
  constructor(private readonly workLocationsService: WorkLocationsService) {}

  /**
   * Lista ubicaciones activas visibles para todos los usuarios autenticados.
   */
  @Get()
  findActive(@CurrentUser() user: JwtPayload) {
    return this.workLocationsService.findActive(user.orgId);
  }

  /**
   * Lista todas las ubicaciones (activas e inactivas) — solo ADMIN.
   */
  @Roles('ADMIN')
  @Get('all')
  findAll(@CurrentUser() user: JwtPayload) {
    return this.workLocationsService.findAll(user.orgId);
  }

  /**
   * Crea una nueva ubicación de trabajo.
   * Acepta (lat + lng) o dirección para geocoding.
   */
  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateWorkLocationDto, @CurrentUser() user: JwtPayload) {
    return this.workLocationsService.create(user.orgId, dto);
  }

  /**
   * Actualiza datos de una ubicación.
   */
  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkLocationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.workLocationsService.update(id, user.orgId, dto);
  }

  /**
   * Activa o desactiva una ubicación sin eliminarla.
   */
  @Roles('ADMIN')
  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.workLocationsService.toggleActive(id, user.orgId);
  }
}
