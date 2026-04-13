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
import { FormFieldsService } from './form-fields.service';
import { CreateFormFieldDto } from './dto/create-form-field.dto';
import { UpdateFormFieldDto } from './dto/update-form-field.dto';
import { ReorderFieldsDto } from './dto/reorder-fields.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

/**
 * Los campos son sub-recursos de un template.
 * Ruta base: /form-templates/:templateId/fields
 *
 * NOTA: La ruta /reorder debe declararse ANTES de /:fieldId para que
 * NestJS no la interprete como un parámetro dinámico.
 */
@Controller('form-templates/:templateId/fields')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormFieldsController {
  constructor(private readonly formFieldsService: FormFieldsService) {}

  /**
   * Lista todos los campos del template ordenados por `order`.
   */
  @Get()
  findAll(
    @Param('templateId') templateId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formFieldsService.findAll(templateId, user.orgId);
  }

  /**
   * Crea un nuevo campo en el template.
   */
  @Roles('ADMIN')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('templateId') templateId: string,
    @Body() dto: CreateFormFieldDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formFieldsService.create(templateId, user.orgId, dto);
  }

  /**
   * Reordena los campos del template.
   * Debe estar declarado antes de PATCH /:fieldId para evitar conflicto de rutas.
   */
  @Roles('ADMIN')
  @Post('reorder')
  reorder(
    @Param('templateId') templateId: string,
    @Body() dto: ReorderFieldsDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formFieldsService.reorder(templateId, user.orgId, dto);
  }

  /**
   * Actualiza un campo específico del template.
   */
  @Roles('ADMIN')
  @Patch(':fieldId')
  update(
    @Param('templateId') templateId: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: UpdateFormFieldDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formFieldsService.update(fieldId, templateId, user.orgId, dto);
  }

  /**
   * Elimina un campo del template.
   */
  @Roles('ADMIN')
  @Delete(':fieldId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('templateId') templateId: string,
    @Param('fieldId') fieldId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.formFieldsService.remove(fieldId, templateId, user.orgId);
  }
}
