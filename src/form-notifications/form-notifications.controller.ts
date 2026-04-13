import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { CreateFormNotificationDto } from './dto/create-form-notification.dto';
import { UpdateFormNotificationDto } from './dto/update-form-notification.dto';

@Controller('form-notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class FormNotificationsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista todas las notificaciones configuradas para un template.
   * Se asegura de que el template pertenezca a la org del admin.
   */
  @Get('template/:templateId')
  async findByTemplate(
    @Param('templateId') templateId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: templateId, org_id: user.orgId },
    });
    if (!template) throw new NotFoundException('Template no encontrado');

    return this.prisma.formNotification.findMany({
      where: { template_id: templateId },
      orderBy: { trigger: 'asc' },
    });
  }

  /**
   * Crea una nueva notificación para un template.
   */
  @Post()
  async create(
    @Body() dto: CreateFormNotificationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const template = await this.prisma.formTemplate.findFirst({
      where: { id: dto.template_id, org_id: user.orgId },
    });
    if (!template) throw new NotFoundException('Template no encontrado');

    return this.prisma.formNotification.create({
      data: {
        template_id: dto.template_id,
        trigger: dto.trigger,
        recipients: dto.recipients as object[],
        channels: dto.channels,
        subject: dto.subject,
        body: dto.body,
        enabled: dto.enabled ?? true,
      },
    });
  }

  /**
   * Actualiza una notificación existente.
   */
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateFormNotificationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const notification = await this.prisma.formNotification.findFirst({
      where: { id },
      include: { template: { select: { org_id: true } } },
    });
    if (!notification || notification.template.org_id !== user.orgId) {
      throw new NotFoundException('Notificación no encontrada');
    }

    return this.prisma.formNotification.update({
      where: { id },
      data: {
        ...(dto.recipients !== undefined && {
          recipients: dto.recipients as object[],
        }),
        ...(dto.channels !== undefined && { channels: dto.channels }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.body !== undefined && { body: dto.body }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
    });
  }

  /**
   * Elimina una notificación.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    const notification = await this.prisma.formNotification.findFirst({
      where: { id },
      include: { template: { select: { org_id: true } } },
    });
    if (!notification || notification.template.org_id !== user.orgId) {
      throw new NotFoundException('Notificación no encontrada');
    }

    await this.prisma.formNotification.delete({ where: { id } });
  }
}
