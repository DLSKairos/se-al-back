import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PushNotificationsService, PushPayload } from './push-notifications.service';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/dto/jwt-payload.dto';

@Controller('push')
export class PushNotificationsController {
  constructor(
    private readonly pushService: PushNotificationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Devuelve la clave pública VAPID necesaria para que el cliente
   * registre su suscripción web-push. Endpoint público.
   */
  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.config.getOrThrow<string>('VAPID_PUBLIC_KEY') };
  }

  /**
   * Registra o actualiza la suscripción push del usuario autenticado.
   * El cliente debe pasar el objeto PushSubscription del browser.
   */
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(
    @Body() subscription: Record<string, unknown>,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.pushService.subscribe(user.sub, subscription as any);
  }

  /**
   * Revoca la suscripción push del usuario autenticado.
   */
  @UseGuards(JwtAuthGuard)
  @Delete('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.pushService.unsubscribe(user.sub);
  }

  /**
   * Envía una notificación de prueba al usuario autenticado (ADMIN).
   * Útil para verificar que la suscripción push está activa.
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @Post('test')
  async sendTest(
    @CurrentUser() user: JwtPayload,
    @Body() payload: PushPayload,
  ) {
    await this.pushService.sendToUser(user.sub, {
      title: payload.title ?? 'Notificación de prueba',
      body: payload.body ?? 'El sistema de notificaciones push está funcionando correctamente.',
      icon: payload.icon,
      url: payload.url,
    });
    return { sent: true };
  }
}
