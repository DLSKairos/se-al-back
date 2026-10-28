import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * Rate limit por usuario autenticado y por IP para el resto.
 *
 * Contar solo por IP castiga a las cuadrillas de una misma obra (comparten WiFi/NAT).
 * Este guard corre ANTES de JwtAuthGuard, así que verifica la firma del JWT aquí
 * (sin tocar BD): un token inválido o ausente cae a la IP, por lo que no se puede
 * evadir el límite enviando tokens falsos ni gastar la cuota de otro usuario.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly jwt: JwtService;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    config: ConfigService,
  ) {
    super(options, storageService, reflector);
    this.jwt = new JwtService({ secret: config.getOrThrow<string>('JWT_SECRET') });
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      try {
        const payload = this.jwt.verify<{ sub?: string }>(auth.slice(7));
        if (payload?.sub) return `u:${payload.sub}`;
      } catch {
        /* token inválido → se cuenta por IP */
      }
    }
    return `ip:${req.ip}`;
  }
}
