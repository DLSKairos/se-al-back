import { Logger } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisService } from '../../redis/redis.service';

/**
 * Almacén del rate limit en Redis: el contador se comparte entre todas las
 * instancias. El cliente ioredis se resuelve en el primer uso (RedisService lo
 * crea en onModuleInit, después de que ThrottlerModule instancia este storage).
 *
 * Fail-open: si Redis falla se deja pasar la request en lugar de devolver 500;
 * el rate limit es una protección, no una fuente de verdad.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private inner?: ThrottlerStorageRedisService;

  constructor(private readonly redis: RedisService) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      this.inner ??= new ThrottlerStorageRedisService(this.redis.getClient());
      return await this.inner.increment(key, ttl, limit, blockDuration, throttlerName);
    } catch (err) {
      this.logger.warn(`Redis no disponible, rate limit omitido: ${(err as Error).message}`);
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
