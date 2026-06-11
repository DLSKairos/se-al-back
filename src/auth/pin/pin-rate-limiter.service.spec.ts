import { PinRateLimiterService } from './pin-rate-limiter.service';

// ─── Mock de RedisService ─────────────────────────────────────────────────────

/**
 * Implementación en memoria del RedisService para tests unitarios.
 * Simula INCR + EXPIRE + DEL con un Map local.
 */
class MockRedisService {
  private readonly store = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const current = this.store.get(key) ?? 0;
    const next = current + 1;
    this.store.set(key, next);
    return next;
  }

  async expire(_key: string, _ttl: number): Promise<void> {
    // No es necesario simular expiración en tests unitarios
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  // Helpers para tests
  _clear() {
    this.store.clear();
  }
}

describe('PinRateLimiterService', () => {
  let service: PinRateLimiterService;
  let mockRedis: MockRedisService;
  const TEST_IP = '192.168.1.1';

  beforeEach(() => {
    mockRedis = new MockRedisService();
    service = new PinRateLimiterService(mockRedis as any);
  });

  describe('checkLimit', () => {
    it('should allow the first attempt from a new IP', async () => {
      const result = await service.checkLimit(TEST_IP);
      expect(result).toBe(true);
    });

    it('should allow up to 10 attempts within the window', async () => {
      for (let i = 0; i < 10; i++) {
        const result = await service.checkLimit(TEST_IP);
        expect(result).toBe(true);
      }
    });

    it('should block the 11th attempt within the window', async () => {
      for (let i = 0; i < 10; i++) {
        await service.checkLimit(TEST_IP);
      }
      const result = await service.checkLimit(TEST_IP);
      expect(result).toBe(false);
    });

    it('should allow attempts from different IPs independently', async () => {
      const ip1 = '10.0.0.1';
      const ip2 = '10.0.0.2';

      for (let i = 0; i < 10; i++) {
        await service.checkLimit(ip1);
      }

      // ip1 bloqueada
      expect(await service.checkLimit(ip1)).toBe(false);
      // ip2 no afectada
      expect(await service.checkLimit(ip2)).toBe(true);
    });
  });

  describe('resetLimit', () => {
    it('should allow attempts again after reset', async () => {
      // Llegar al límite
      for (let i = 0; i < 10; i++) {
        await service.checkLimit(TEST_IP);
      }
      expect(await service.checkLimit(TEST_IP)).toBe(false);

      // Reset
      await service.resetLimit(TEST_IP);

      // Debe funcionar de nuevo
      expect(await service.checkLimit(TEST_IP)).toBe(true);
    });

    it('should not throw when resetting an IP with no attempts', async () => {
      await expect(service.resetLimit('0.0.0.0')).resolves.not.toThrow();
    });
  });
});
