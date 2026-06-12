import { FeatureFlagsService, KNOWN_FLAGS } from './feature-flags.service';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS MANUALES
// ═══════════════════════════════════════════════════════════════════════════════

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();
const mockMget = jest.fn();

const redis = {
  get: mockRedisGet,
  set: mockRedisSet,
  getClient: jest.fn().mockReturnValue({
    mget: mockMget,
  }),
} as any;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Crea una instancia del servicio con los flags precargados en caché vía mget.
 * Permite simular el estado de Redis en el arranque sin TTL issue.
 */
async function createService(
  flagValues: Partial<Record<string, string | null>> = {},
): Promise<FeatureFlagsService> {
  jest.clearAllMocks();

  // mget devuelve los valores en el mismo orden que KNOWN_FLAGS
  const mgetValues = KNOWN_FLAGS.map((f) =>
    f in flagValues ? (flagValues[f] ?? null) : null,
  );
  mockMget.mockResolvedValue(mgetValues);
  mockRedisGet.mockResolvedValue(null);
  mockRedisSet.mockResolvedValue(undefined);

  const svc = new FeatureFlagsService(redis);
  await svc.onModuleInit();
  return svc;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  beforeEach(async () => {
    // Instancia base con todos los flags apagados
    service = await createService();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // isEnabled — parseValue
  // ───────────────────────────────────────────────────────────────────────────

  describe('isEnabled — via mget en init', () => {
    it('should return false for a flag that has null in Redis', async () => {
      // Todos son null → false (ya cargado en beforeEach)
      const result = await service.isEnabled('oauth_google');
      expect(result).toBe(false);
    });

    it('should return true when flag was initialized with "on"', async () => {
      const svc = await createService({ oauth_google: 'on' });
      const result = await svc.isEnabled('oauth_google');
      svc.onModuleDestroy();
      expect(result).toBe(true);
    });

    it('should return true when flag was initialized with "true"', async () => {
      const svc = await createService({ magic_link: 'true' });
      const result = await svc.isEnabled('magic_link');
      svc.onModuleDestroy();
      expect(result).toBe(true);
    });

    it('should return true when flag was initialized with "1"', async () => {
      const svc = await createService({ electronic_signature: '1' });
      const result = await svc.isEnabled('electronic_signature');
      svc.onModuleDestroy();
      expect(result).toBe(true);
    });

    it('should return false when flag was initialized with "off"', async () => {
      const svc = await createService({ oauth_microsoft: 'off' });
      const result = await svc.isEnabled('oauth_microsoft');
      svc.onModuleDestroy();
      expect(result).toBe(false);
    });

    it('should return false when flag was initialized with "false"', async () => {
      const svc = await createService({ superadmin_panel: 'false' });
      const result = await svc.isEnabled('superadmin_panel');
      svc.onModuleDestroy();
      expect(result).toBe(false);
    });

    it('should use in-memory cache and NOT call Redis.get within the TTL window', async () => {
      // setFlag pone el valor en caché
      await service.setFlag('electronic_signature', true);
      mockRedisGet.mockClear();

      const result = await service.isEnabled('electronic_signature');

      expect(result).toBe(true);
      // El caché está vigente → no debe consultar redis.get
      expect(mockRedisGet).not.toHaveBeenCalled();
    });

    it('should fall back to Redis.get for an unknown (non-known) flag not in cache', async () => {
      mockRedisGet.mockResolvedValue('on');

      const result = await service.isEnabled('totally_new_custom_flag');

      expect(result).toBe(true);
      expect(mockRedisGet).toHaveBeenCalledWith('feature:totally_new_custom_flag');
    });

    it('should return false for an unknown flag absent from Redis', async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await service.isEnabled('nonexistent_flag');

      expect(result).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // isEnabledSync
  // ───────────────────────────────────────────────────────────────────────────

  describe('isEnabledSync', () => {
    it('should return false for unknown flag (not in cache)', () => {
      const result = service.isEnabledSync('totally_unknown_flag');
      expect(result).toBe(false);
    });

    it('should return true after setFlag(true)', async () => {
      await service.setFlag('magic_link', true);
      expect(service.isEnabledSync('magic_link')).toBe(true);
    });

    it('should return false after setFlag(false)', async () => {
      await service.setFlag('oauth_google', true);
      await service.setFlag('oauth_google', false);

      expect(service.isEnabledSync('oauth_google')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // setFlag
  // ───────────────────────────────────────────────────────────────────────────

  describe('setFlag', () => {
    it('should persist "on" to Redis when enabling a flag', async () => {
      await service.setFlag('electronic_signature', true);

      expect(mockRedisSet).toHaveBeenCalledWith('feature:electronic_signature', 'on');
    });

    it('should persist "off" to Redis when disabling a flag', async () => {
      await service.setFlag('magic_link', false);

      expect(mockRedisSet).toHaveBeenCalledWith('feature:magic_link', 'off');
    });

    it('should update in-memory cache immediately', async () => {
      await service.setFlag('oauth_google', true);
      expect(service.isEnabledSync('oauth_google')).toBe(true);

      await service.setFlag('oauth_google', false);
      expect(service.isEnabledSync('oauth_google')).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // refreshCache
  // ───────────────────────────────────────────────────────────────────────────

  describe('refreshCache', () => {
    it('should call mget with all known flag keys', async () => {
      mockMget.mockResolvedValue(Array(KNOWN_FLAGS.length).fill(null));

      await service.refreshCache();

      const lastCall = mockMget.mock.calls[mockMget.mock.calls.length - 1] as string[];
      KNOWN_FLAGS.forEach((flag) => {
        expect(lastCall).toContain(`feature:${flag}`);
      });
    });

    it('should update in-memory cache with fresh values from Redis', async () => {
      // Primer refresh: todos null
      expect(service.isEnabledSync('oauth_google')).toBe(false);

      // Segundo refresh con oauth_google = 'on'
      const freshValues = KNOWN_FLAGS.map((f) =>
        f === 'oauth_google' ? 'on' : null,
      );
      mockMget.mockResolvedValue(freshValues);

      await service.refreshCache();

      expect(service.isEnabledSync('oauth_google')).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getAllKnownFlags
  // ───────────────────────────────────────────────────────────────────────────

  describe('getAllKnownFlags', () => {
    it('should return an object with all known flag names as keys', async () => {
      const result = await service.getAllKnownFlags();

      KNOWN_FLAGS.forEach((flag) => {
        expect(result).toHaveProperty(flag);
      });
    });

    it('should return false for all flags when none are set', async () => {
      const result = await service.getAllKnownFlags();

      Object.values(result).forEach((value) => {
        expect(value).toBe(false);
      });
    });

    it('should return true for a flag that was enabled via setFlag', async () => {
      await service.setFlag('magic_link', true);

      const result = await service.getAllKnownFlags();

      expect(result['magic_link']).toBe(true);
    });
  });
});
