import { PinRateLimiterService } from './pin-rate-limiter.service';

describe('PinRateLimiterService', () => {
  let service: PinRateLimiterService;
  const TEST_IP = '192.168.1.1';

  beforeEach(() => {
    service = new PinRateLimiterService();
  });

  describe('checkLimit', () => {
    it('should allow the first attempt from a new IP', () => {
      const result = service.checkLimit(TEST_IP);
      expect(result).toBe(true);
    });

    it('should allow up to 10 attempts within the window', () => {
      for (let i = 0; i < 10; i++) {
        const result = service.checkLimit(TEST_IP);
        expect(result).toBe(true);
      }
    });

    it('should block the 11th attempt within the window', () => {
      // 10 intentos permitidos (el primero del checkLimit setea count=1, luego incrementa)
      // El primer checkLimit retorna true y setea count=1
      // Del segundo al décimo retorna true e incrementa count
      // El undécimo debería ser bloqueado (count >= 10)
      for (let i = 0; i < 10; i++) {
        service.checkLimit(TEST_IP);
      }
      const result = service.checkLimit(TEST_IP);
      expect(result).toBe(false);
    });

    it('should allow attempts from different IPs independently', () => {
      const ip1 = '10.0.0.1';
      const ip2 = '10.0.0.2';

      for (let i = 0; i < 10; i++) {
        service.checkLimit(ip1);
      }

      // ip1 bloqueada
      expect(service.checkLimit(ip1)).toBe(false);
      // ip2 no afectada
      expect(service.checkLimit(ip2)).toBe(true);
    });
  });

  describe('resetLimit', () => {
    it('should allow attempts again after reset', () => {
      // Llegar al límite
      for (let i = 0; i < 10; i++) {
        service.checkLimit(TEST_IP);
      }
      expect(service.checkLimit(TEST_IP)).toBe(false);

      // Reset
      service.resetLimit(TEST_IP);

      // Debe funcionar de nuevo
      expect(service.checkLimit(TEST_IP)).toBe(true);
    });

    it('should not throw when resetting an IP with no attempts', () => {
      expect(() => service.resetLimit('0.0.0.0')).not.toThrow();
    });
  });

  describe('window expiry', () => {
    it('should reset counter when time window expires', () => {
      const realDateNow = Date.now;

      try {
        let fakeNow = Date.now();
        Date.now = jest.fn(() => fakeNow);

        // Llegar al límite
        for (let i = 0; i < 10; i++) {
          service.checkLimit(TEST_IP);
        }
        expect(service.checkLimit(TEST_IP)).toBe(false);

        // Avanzar más de 15 minutos
        fakeNow += 16 * 60 * 1000;

        // Debe permitir el intento porque la ventana expiró
        expect(service.checkLimit(TEST_IP)).toBe(true);
      } finally {
        Date.now = realDateNow;
      }
    });
  });
});
