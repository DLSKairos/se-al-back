import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { FormSubmissionsService } from './form-submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { SubmissionStatus } from '@prisma/client';

@Controller('form-submissions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormSubmissionsController {
  constructor(
    private readonly formSubmissionsService: FormSubmissionsService,
  ) {}

  /**
   * Devuelve el contexto necesario para renderizar un formulario:
   * template con campos, última submission válida por frecuencia, etc.
   * Debe estar declarado ANTES de /:id para evitar conflicto de rutas.
   */
  @Get('context/:templateId')
  getContext(
    @Param('templateId') templateId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formSubmissionsService.getContext(
      templateId,
      user.orgId,
      user.sub,
    );
  }

  /**
   * Crea una nueva submission. Cualquier usuario autenticado puede enviar.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateSubmissionDto, @CurrentUser() user: JwtPayload) {
    return this.formSubmissionsService.create(user.orgId, user.sub, dto, dto.work_location_id, dto.geo_lat, dto.geo_lng);
  }

  /**
   * Lista todas las submissions con filtros y paginación — solo ADMIN.
   */
  @Roles('ADMIN')
  @Get()
  findAll(
    @Query() query: SubmissionQueryDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formSubmissionsService.findAll(user.orgId, query);
  }

  /**
   * Obtiene el detalle de una submission específica.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.formSubmissionsService.findOne(id, user.orgId);
  }

  /**
   * Cambia el estado de una submission (APPROVED / REJECTED) — solo ADMIN.
   */
  @Roles('ADMIN')
  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body('status') status: SubmissionStatus,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formSubmissionsService.changeStatus(id, user.orgId, status, user.sub, user.role);
  }
}
