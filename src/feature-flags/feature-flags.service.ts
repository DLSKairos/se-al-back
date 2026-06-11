import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/** Flags conocidos que se exponen en el endpoint público para la UI. */
export const KNOWN_FLAGS = [
  'oauth_google',
  'oauth_microsoft',
  'electronic_signature',
  'magic_link',
  'superadmin_panel',
] as const;

export type KnownFlag = (typeof KNOWN_FLAGS)[number];

interface CacheEntry {
  value: boolean;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000; // 30 segundos
const REDIS_PREFIX = 'feature:';

/**
 * Servicio @Global para consulta de feature flags almacenados en Redis.
 *
 * Estrategia de caché en memoria:
 * - Al inicializar, lee todos los flags conocidos de Redis y los almacena en un
 *   Map local con TTL de 30s.
 * - Un setInterval refresca el cache cada 30s en segundo plano.
 * - isEnabled() usa el cache si la entrada no ha expirado; si expiró, lee Redis
 *   puntualmente y actualiza el cache.
 * - isEnabledSync() solo lee el Map local (para contextos no async); devuelve
 *   false si la entrada no existe (comportamiento conservador).
 *
 * Regla de ausencia: clave no existente en Redis → flag = off (false).
 * Valores que activan el flag: "on" | "true" | "1".
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private readonly cache = new Map<string, CacheEntry>();
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly redis: RedisService) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
    this.refreshInterval = setInterval(() => {
      this.refreshCache().catch((err: unknown) => {
        this.logger.error(
          `Error refrescando cache de feature flags: ${String(err)}`,
        );
      });
    }, CACHE_TTL_MS);
  }

  onModuleDestroy(): void {
    if (this.refreshInterval !== null) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Lee el flag. Si está en caché y no expiró → retorna del cache.
   * Si expiró o no existe → consulta Redis y actualiza el cache.
   * Clave Redis ausente → false.
   */
  async isEnabled(flag: string): Promise<boolean> {
    const entry = this.cache.get(flag);
    if (entry && entry.expiresAt > Date.now()) {
      return entry.value;
    }

    const raw = await this.redis.get(`${REDIS_PREFIX}${flag}`);
    const value = this.parseValue(raw);
    this.setCache(flag, value);
    return value;
  }

  /**
   * Equivalente síncrono usando solo el cache local.
   * Si la entrada no existe o expiró → retorna false (conservador).
   */
  isEnabledSync(flag: string): boolean {
    const entry = this.cache.get(flag);
    if (!entry || entry.expiresAt <= Date.now()) return false;
    return entry.value;
  }

  /**
   * Lee todos los flags conocidos de Redis y actualiza el cache.
   * Llamado al arrancar y cada 30s por el intervalo.
   */
  async refreshCache(): Promise<void> {
    const client = this.redis.getClient();
    const keys = KNOWN_FLAGS.map((f) => `${REDIS_PREFIX}${f}`);
    const values = await client.mget(...keys);

    KNOWN_FLAGS.forEach((flag, i) => {
      const value = this.parseValue(values[i] ?? null);
      this.setCache(flag, value);
    });

    this.logger.debug(
      `Feature flags refrescados: ${KNOWN_FLAGS.map((f, i) => `${f}=${values[i]}`).join(', ')}`,
    );
  }

  /**
   * Activa o desactiva un flag en Redis y actualiza el cache local inmediatamente.
   */
  async setFlag(flag: string, enabled: boolean): Promise<void> {
    await this.redis.set(`${REDIS_PREFIX}${flag}`, enabled ? 'on' : 'off');
    this.setCache(flag, enabled);
    this.logger.log(
      `Feature flag '${flag}' cambiado a: ${enabled ? 'on' : 'off'}`,
    );
  }

  /**
   * Retorna el estado de todos los flags conocidos para el endpoint público.
   */
  async getAllKnownFlags(): Promise<Record<KnownFlag, boolean>> {
    const result = {} as Record<KnownFlag, boolean>;
    for (const flag of KNOWN_FLAGS) {
      result[flag] = await this.isEnabled(flag);
    }
    return result;
  }

  // ─── helpers privados ──────────────────────────────────────────────

  private parseValue(raw: string | null): boolean {
    if (raw === null) return false;
    return raw === 'on' || raw === 'true' || raw === '1';
  }

  private setCache(flag: string, value: boolean): void {
    this.cache.set(flag, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}
