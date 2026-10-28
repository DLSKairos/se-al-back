import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD'),
      // Reconexión automática con backoff exponencial
      retryStrategy: (times) => Math.min(times * 100, 3000),
      // Si Redis cae, los comandos fallan rápido en lugar de encolarse y colgar las requests
      maxRetriesPerRequest: 2,
      commandTimeout: 2000,
    });

    this.client.on('error', (err: Error) => {
      new Logger(RedisService.name).error(`Connection error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  /** Acceso directo al cliente ioredis para operaciones avanzadas. */
  getClient(): Redis {
    return this.client;
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.client.expire(key, ttlSeconds);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  // ─── Helpers fail-open (caché) ─────────────────────────────────────────────
  // Para datos que siempre se pueden recalcular desde la BD: si Redis falla se
  // registra y se sigue sin caché. NO usar para locks, rate limits ni challenges.

  /** Lee de caché o ejecuta `loader` y guarda el resultado. Nunca falla por Redis. */
  async remember<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.safeGet(key);
    if (cached !== null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        /* caché corrupta → recargar */
      }
    }
    const value = await loader();
    await this.safeSet(key, JSON.stringify(value), ttlSeconds);
    return value;
  }

  async safeGet(key: string): Promise<string | null> {
    try {
      return await this.client.get(key);
    } catch (err) {
      this.logRedisFailure('get', key, err);
      return null;
    }
  }

  async safeSet(key: string, value: string, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } catch (err) {
      this.logRedisFailure('set', key, err);
    }
  }

  /** Invalida claves de caché; si Redis falla, el TTL corto limita el dato viejo. */
  async safeDel(...keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.client.del(...keys);
    } catch (err) {
      this.logRedisFailure('del', keys.join(','), err);
    }
  }

  /**
   * Lock distribuido (SET NX EX) para crons con varias instancias.
   * Devuelve true si esta instancia lo adquirió. Si Redis falla devuelve false
   * (mejor omitir una ejecución que duplicarla).
   */
  async tryLock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      return (await this.client.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK';
    } catch (err) {
      this.logRedisFailure('lock', key, err);
      return false;
    }
  }

  private logRedisFailure(op: string, key: string, err: unknown) {
    new Logger(RedisService.name).warn(
      `Redis ${op} falló (${key}): ${(err as Error).message}`,
    );
  }
}
