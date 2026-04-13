import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
}

@Injectable()
export class PushNotificationsService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    webpush.setVapidDetails(
      `mailto:${this.config.get<string>('VAPID_EMAIL', 'admin@senal.app')}`,
      this.config.getOrThrow<string>('VAPID_PUBLIC_KEY'),
      this.config.getOrThrow<string>('VAPID_PRIVATE_KEY'),
    );
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const record = await this.prisma.pushSubscription.findUnique({
      where: { user_id: userId },
    });

    if (!record) {
      this.logger.debug(
        `[Push] Usuario ${userId} no tiene suscripción registrada`,
      );
      return;
    }

    const subscription = record.subscription as unknown as webpush.PushSubscription;

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 86400,
        urgency: 'high',
      });
    } catch (err) {
      const error = err as { statusCode?: number };

      // 410 Gone / 404 Not Found → la suscripción expiró o fue revocada
      if (error.statusCode === 410 || error.statusCode === 404) {
        this.logger.warn(
          `[Push] Suscripción expirada para usuario ${userId} — eliminando`,
        );
        await this.prisma.pushSubscription.delete({
          where: { user_id: userId },
        });
      } else {
        this.logger.error(
          `[Push] Error enviando notificación a usuario ${userId}: ${(err as Error).message}`,
        );
      }
    }
  }

  async subscribe(
    userId: string,
    subscription: webpush.PushSubscription,
  ): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: { user_id: userId },
      update: { subscription: subscription as object },
      create: { user_id: userId, subscription: subscription as object },
    });
  }

  async unsubscribe(userId: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { user_id: userId },
    });
  }
}
