import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const MAX_ATTEMPTS = 10;
const WINDOW_SECONDS = 15 * 60; // 15 minutos

/**
 * Rate limiter para intentos de verificación de PIN.
 * Límite: 10 intentos por IP cada 15 minutos.
 * Usa Redis para persistencia multi-instancia (Fix #4).
 */
@Injectable()
export class PinRateLimiterService {
  private readonly logger = new Logger(PinRateLimiterService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Verifica si la IP puede realizar un intento de PIN.
   * Retorna false si superó el límite.
   */
  async checkLimit(ip: string): Promise<boolean> {
    const key = `pin:attempts:${ip}`;
    const count = await this.redis.incr(key);

    // Solo aplica TTL en el primer intento de la ventana
    if (count === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }

    if (count > MAX_ATTEMPTS) {
      this.logger.warn(
        `[PIN Rate Limit] IP ${ip} bloqueada — ${count} intentos en ventana activa`,
      );
      return false;
    }

    return true;
  }

  /**
   * Reinicia el contador de la IP al autenticar exitosamente.
   */
  async resetLimit(ip: string): Promise<void> {
    await this.redis.del(`pin:attempts:${ip}`);
  }
}
