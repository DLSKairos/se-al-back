import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { AuthModule } from '../auth/auth.module';

/**
 * Módulo de notificaciones en-app.
 *
 * Exporta NotificationsService para que otros módulos puedan invocar
 * create() sin importar toda la infraestructura WebSocket.
 *
 * Dependencias externas:
 * - PrismaModule (@Global) — disponible automáticamente
 * - RedisModule (@Global) — disponible automáticamente
 * - ConfigModule (@Global, isGlobal: true) — disponible automáticamente
 * - AuthModule — importado para disponer de JwtService en el gateway
 *
 * Para registrar en AppModule: añadir NotificationsModule a imports[].
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
