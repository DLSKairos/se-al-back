import {
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { RedisService } from '../redis/redis.service';
import { NOTIFICATION_CHANNEL } from './notifications.service';

/** Payload publicado en el canal Redis por NotificationsService. */
interface NotificationCreatedPayload {
  notificationId: string;
  userId: string;
  type: string;
  title: string;
}

/**
 * Gateway WebSocket para entrega de notificaciones en tiempo real.
 *
 * Namespace: /notifications
 * Autenticación: JWT en handshake via socket.auth.token
 * Rooms: user:{userId} — cada cliente se une a su propio room
 *
 * Flujo:
 *  1. Cliente conecta con { auth: { token: '<jwt>' } }
 *  2. El gateway valida el JWT y une al cliente al room user:{sub}
 *  3. NotificationsService publica en Redis canal 'notification.created'
 *  4. El subscriber Redis reenvía el evento 'notification' al room del usuario
 *
 * CORS: replica la lógica de main.ts sin modificarlo.
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin) return callback(null, true);
      const isProduction = process.env.NODE_ENV === 'production';
      if (
        !isProduction &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      const allowedOrigin = process.env.FRONTEND_URL;
      if (allowedOrigin && origin === allowedOrigin) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  },
})
export class NotificationsGateway
  implements
    OnGatewayInit,
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  /**
   * Cliente ioredis duplicado para suscripción pub/sub.
   * Redis no permite usar el mismo cliente para pub/sub y comandos generales,
   * por eso se duplica el cliente base del RedisService.
   */
  private subscriber!: Redis;

  constructor(
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Ciclo de vida del módulo ────────────────────────────────────────────────

  onModuleInit(): void {
    this.subscriber = this.redisService.getClient().duplicate();

    this.subscriber.on('error', (err: Error) => {
      this.logger.error(
        `Error en subscriber Redis del gateway: ${err.message}`,
      );
    });

    this.subscriber.subscribe(NOTIFICATION_CHANNEL, (err) => {
      if (err) {
        this.logger.error(
          `Error al suscribirse a canal ${NOTIFICATION_CHANNEL}: ${err.message}`,
        );
        return;
      }
      this.logger.log(`Suscrito al canal Redis: ${NOTIFICATION_CHANNEL}`);
    });

    this.subscriber.on(
      'message',
      (channel: string, message: string) => {
        if (channel !== NOTIFICATION_CHANNEL) return;
        this.handleRedisMessage(message);
      },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.subscriber.quit();
  }

  afterInit(_server: Server): void {
    this.logger.log('NotificationsGateway inicializado en /notifications');
  }

  // ─── Conexión / desconexión ──────────────────────────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth as { token?: string })?.token ??
        (client.handshake.headers?.authorization as string | undefined)
          ?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Conexión rechazada (sin token): ${client.id}`);
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        orgId: string;
        role: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });

      // Guardar el userId en el socket para limpieza en desconexión
      (client as Socket & { userId?: string }).userId = payload.sub;

      const room = `user:${payload.sub}`;
      await client.join(room);

      this.logger.log(
        `Cliente ${client.id} conectado → room ${room}`,
      );
    } catch (err) {
      this.logger.warn(
        `Conexión rechazada (token inválido): ${client.id} — ${String(err)}`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const userId = (client as Socket & { userId?: string }).userId;
    this.logger.log(
      `Cliente ${client.id} desconectado${userId ? ` (user:${userId})` : ''}`,
    );
  }

  // ─── Manejo del mensaje Redis ────────────────────────────────────────────────

  private handleRedisMessage(message: string): void {
    try {
      const payload = JSON.parse(message) as NotificationCreatedPayload;
      const room = `user:${payload.userId}`;

      this.server.to(room).emit('notification', {
        notificationId: payload.notificationId,
        type: payload.type,
        title: payload.title,
      });
    } catch (err) {
      this.logger.error(
        `Error procesando mensaje Redis en gateway: ${String(err)}`,
      );
    }
  }

  // ─── Evento de ping (health check del cliente) ───────────────────────────────

  @SubscribeMessage('ping')
  handlePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() _data: unknown,
  ): { event: string; data: string } {
    return { event: 'pong', data: 'ok' };
  }
}
