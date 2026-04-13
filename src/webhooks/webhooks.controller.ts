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
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  /**
   * Lista todos los webhook endpoints de la organización.
   */
  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.webhooksService.findAll(user.orgId);
  }

  /**
   * Registra un nuevo webhook endpoint.
   * El secret se genera automáticamente en el service.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWebhookDto, @CurrentUser() user: JwtPayload) {
    return this.webhooksService.create(user.orgId, dto);
  }

  /**
   * Actualiza la URL o los event_types de un webhook.
   */
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWebhookDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.webhooksService.update(id, user.orgId, dto);
  }

  /**
   * Elimina un webhook endpoint.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.webhooksService.remove(id, user.orgId);
  }
}
