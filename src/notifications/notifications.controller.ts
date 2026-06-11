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
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';
import { CreateBulkNotificationDto } from './dto/create-bulk-notification.dto';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { QuerySentNotificationsDto } from './dto/query-sent-notifications.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // ─── Endpoints del usuario autenticado ──────────────────────────────────────

  /**
   * GET /notifications
   * Lista paginada de notificaciones del usuario autenticado.
   * Params query: unreadOnly?, page?, limit?
   */
  @Get('notifications')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: QueryNotificationsDto,
  ) {
    return this.notificationsService.findAllForUser(user.sub, query);
  }

  /**
   * PATCH /notifications/read-all
   * Marca todas las notificaciones del usuario autenticado como leídas.
   * Debe estar ANTES de /:id/read para evitar que "read-all" sea capturado como :id.
   */
  @Patch('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  markAllAsRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllAsRead(user.sub);
  }

  /**
   * PATCH /notifications/:id/read
   * Marca una notificación como leída. Valida ownership.
   */
  @Patch('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  markAsRead(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAsRead(id, user.sub);
  }

  // ─── Endpoints de admin ───────────────────────────────────────────────────

  /**
   * POST /admin/notifications
   * Envío masivo de notificaciones CUSTOM_ADMIN.
   * Guard: ADMIN o SUPER_ADMIN. Acotado a la org del admin autenticado.
   */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post('admin/notifications')
  @HttpCode(HttpStatus.CREATED)
  createBulk(
    @Body() dto: CreateBulkNotificationDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.createBulkByAdmin(
      user.sub,
      user.orgId,
      dto,
    );
  }

  /**
   * GET /admin/notifications/sent
   * Historial de notificaciones enviadas por admins de la org del usuario autenticado.
   */
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/notifications/sent')
  findSent(
    @CurrentUser() user: JwtPayload,
    @Query() query: QuerySentNotificationsDto,
  ) {
    return this.notificationsService.findSentByOrg(
      user.sub,
      user.orgId,
      query,
    );
  }
}
