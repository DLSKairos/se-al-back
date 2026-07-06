import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const MAX_ATTEMPTS_IP = 10;
const MAX_ATTEMPTS_ACCOUNT = 5; // Fix H2: umbral más bajo por cuenta
const WINDOW_SECONDS = 15 * 60; // 15 minutos

/**
 * Rate limiter para intentos de PIN.
 * - Por IP: 10 intentos / 15 min (Fix #4).
 * - Por cuenta (identification_number): 5 intentos / 15 min (Fix H2).
 *
 * El contador por cuenta impide la fuerza bruta distribuida con IPs rotativas,
 * que evadía el límite por-IP original.
 * Usa Redis para persistencia multi-instancia.
 */
@Injectable()
export class PinRateLimiterService {
  private readonly logger = new Logger(PinRateLimiterService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Verifica si se permite un intento de PIN. Cuenta contra el límite por IP y,
   * si se provee, contra el límite por cuenta. Retorna false si CUALQUIERA de
   * los dos límites se supera.
   */
  async checkLimit(ip: string, identificationNumber?: string): Promise<boolean> {
    const ipOk = await this.bump(`pin:attempts:ip:${ip}`, MAX_ATTEMPTS_IP);
    if (!ipOk) {
      this.logger.warn(`[PIN Rate Limit] IP ${ip} bloqueada por exceso de intentos`);
      return false;
    }

    if (identificationNumber) {
      const accountOk = await this.bump(
        `pin:attempts:acct:${identificationNumber}`,
        MAX_ATTEMPTS_ACCOUNT,
      );
      if (!accountOk) {
        this.logger.warn(
          `[PIN Rate Limit] Cuenta ${identificationNumber} bloqueada por exceso de intentos`,
        );
        return false;
      }
    }

    return true;
  }

  /** Incrementa un contador con TTL en el primer intento; false si excede max. */
  private async bump(key: string, max: number): Promise<boolean> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, WINDOW_SECONDS);
    }
    return count <= max;
  }

  /**
   * Reinicia los contadores (IP y cuenta) al autenticar exitosamente.
   */
  async resetLimit(ip: string, identificationNumber?: string): Promise<void> {
    await this.redis.del(`pin:attempts:ip:${ip}`);
    if (identificationNumber) {
      await this.redis.del(`pin:attempts:acct:${identificationNumber}`);
    }
  }
}
