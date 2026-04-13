import { Injectable, Logger } from '@nestjs/common';

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos en milisegundos

interface AttemptRecord {
  count: number;
  windowStart: number;
}

/**
 * Rate limiter para intentos de verificación de PIN.
 * Límite: 10 intentos por IP cada 15 minutos.
 * Usa Map en memoria — adecuado para instancia única.
 */
@Injectable()
export class PinRateLimiterService {
  private readonly logger = new Logger(PinRateLimiterService.name);
  private readonly attempts = new Map<string, AttemptRecord>();

  /**
   * Verifica si la IP puede realizar un intento de PIN.
   * Retorna false si superó el límite y loggea el evento.
   */
  checkLimit(ip: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(ip);

    if (!record) {
      this.attempts.set(ip, { count: 1, windowStart: now });
      return true;
    }

    // Si la ventana expiró, reiniciar el contador
    if (now - record.windowStart > WINDOW_MS) {
      this.attempts.set(ip, { count: 1, windowStart: now });
      return true;
    }

    // Dentro de la ventana activa
    if (record.count >= MAX_ATTEMPTS) {
      const remainingMs = WINDOW_MS - (now - record.windowStart);
      const remainingMin = Math.ceil(remainingMs / 60_000);
      this.logger.warn(
        `[PIN Rate Limit] IP ${ip} bloqueada — ${record.count} intentos en ventana activa. ` +
          `Tiempo restante: ~${remainingMin} min`,
      );
      return false;
    }

    record.count += 1;
    return true;
  }

  /**
   * Reinicia el contador de la IP al autenticar exitosamente.
   */
  resetLimit(ip: string): void {
    this.attempts.delete(ip);
  }
}
