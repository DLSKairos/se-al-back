import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { FormTemplatesService } from './form-templates.service';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { FormTemplateStatus } from '@prisma/client';

@Controller('form-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormTemplatesController {
  constructor(private readonly formTemplatesService: FormTemplatesService) {}

  /**
   * Lista templates ACTIVOS — visibles para todos los usuarios autenticados.
   */
  @Get()
  findActive(@CurrentUser() user: JwtPayload) {
    return this.formTemplatesService.findActive(user.orgId, user.role, user.jobTitle);
  }

  /**
   * Lista todos los templates (cualquier estado) — solo ADMIN.
   * Debe estar declarado ANTES de /:id para evitar conflicto.
   */
  @Roles('ADMIN')
  @Get('admin')
  findAllAdmin(@CurrentUser() user: JwtPayload) {
    return this.formTemplatesService.findAllAdmin(user.orgId);
  }

  /**
   * Crea un nuevo template en estado DRAFT.
   */
  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateFormTemplateDto, @CurrentUser() user: JwtPayload) {
    return this.formTemplatesService.create(user.orgId, user.sub, dto);
  }

  /**
   * Obtiene el detalle de un template por ID.
   */
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.formTemplatesService.findOne(id, user.orgId);
  }

  /**
   * Actualiza los campos editables de un template.
   */
  @Roles('ADMIN')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFormTemplateDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formTemplatesService.update(id, user.orgId, dto);
  }

  /**
   * Cambia el estado del template (DRAFT → ACTIVE → ARCHIVED).
   */
  @Roles('ADMIN')
  @Patch(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body('status') status: FormTemplateStatus,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formTemplatesService.changeStatus(id, user.orgId, status);
  }

  /**
   * Elimina un template (solo si está en estado DRAFT).
   */
  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.formTemplatesService.remove(id, user.orgId);
  }
}
