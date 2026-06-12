import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanLimitsGuard } from './plan-limits.guard';
import {
  PLAN_LIMIT_RESOURCE_KEY,
} from '../decorators/plan-limit-resource.decorator';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCKS MANUALES
// ═══════════════════════════════════════════════════════════════════════════════

const mockRedisGet = jest.fn();
const mockRedisSet = jest.fn();

const redis = {
  get: mockRedisGet,
  set: mockRedisSet,
} as any;

const mockOrgConfigFindUnique = jest.fn();
const mockUserCount = jest.fn();
const mockWorkLocationCount = jest.fn();

const prisma = {
  orgConfig: {
    findUnique: mockOrgConfigFindUnique,
  },
  user: {
    count: mockUserCount,
  },
  workLocation: {
    count: mockWorkLocationCount,
  },
} as any;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildContext(
  role: string,
  orgId: string,
  resource?: string,
): ExecutionContext {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(resource);

  const context = {
    getHandler: jest.fn().mockReturnValue('createUser'),
    getClass: jest.fn().mockReturnValue('UsersController'),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: { sub: 'user-1', orgId, role, jobTitle: '' },
      }),
    }),
  } as unknown as ExecutionContext;

  return context;
}

function buildGuard() {
  const reflector = new Reflector();
  return {
    guard: new PlanLimitsGuard(reflector, prisma, redis),
    reflector,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('PlanLimitsGuard', () => {
  let guard: PlanLimitsGuard;
  let reflector: Reflector;

  beforeEach(() => {
    jest.clearAllMocks();
    const built = buildGuard();
    guard = built.guard;
    reflector = built.reflector;

    // Por defecto: caché vacío
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue(undefined);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Sin decorator → siempre permite
  // ───────────────────────────────────────────────────────────────────────────

  it('should allow request when no @PlanLimitResource decorator is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'u1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SUPER_ADMIN siempre exento
  // ───────────────────────────────────────────────────────────────────────────

  it('should always allow SUPER_ADMIN regardless of plan limits', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users');

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'super-1', orgId: 'org-kairos', role: 'SUPER_ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    // No debe consultar el OrgConfig para SUPER_ADMIN
    expect(mockOrgConfigFindUnique).not.toHaveBeenCalled();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Sin OrgConfig → permite con warning
  // ───────────────────────────────────────────────────────────────────────────

  it('should allow when org has no OrgConfig (no plan configured)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users');
    mockOrgConfigFindUnique.mockResolvedValue(null);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-no-config', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Recurso: users — bajo el límite
  // ───────────────────────────────────────────────────────────────────────────

  it('should allow user creation when current user count is below the plan limit', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users');
    mockOrgConfigFindUnique.mockResolvedValue({ plan: 'STARTER', max_users: 10, max_sites: 5 });
    mockUserCount.mockResolvedValue(5); // 5 de 10 → permite

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Recurso: users — en el límite exacto → bloquea
  // ───────────────────────────────────────────────────────────────────────────

  it('should throw ForbiddenException when user count equals the plan max_users limit', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users');
    mockOrgConfigFindUnique.mockResolvedValue({ plan: 'STARTER', max_users: 10, max_sites: 5 });
    mockUserCount.mockResolvedValue(10); // 10 de 10 → exactamente en el límite

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should include plan name and max limit in the ForbiddenException message for users', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users');
    mockOrgConfigFindUnique.mockResolvedValue({ plan: 'STARTER', max_users: 10, max_sites: 5 });
    mockUserCount.mockResolvedValue(10);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    const error = await guard.canActivate(context).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    const message = (error as ForbiddenException).message;
    expect(message).toContain('STARTER');
    expect(message).toContain('10');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Recurso: sites
  // ───────────────────────────────────────────────────────────────────────────

  it('should allow site creation when current site count is below the plan limit', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('sites');
    mockOrgConfigFindUnique.mockResolvedValue({ plan: 'PROFESSIONAL', max_users: 50, max_sites: 3 });
    mockWorkLocationCount.mockResolvedValue(2); // 2 de 3 → permite

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw ForbiddenException when site count equals the plan max_sites limit', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('sites');
    mockOrgConfigFindUnique.mockResolvedValue({ plan: 'PROFESSIONAL', max_users: 50, max_sites: 3 });
    mockWorkLocationCount.mockResolvedValue(3); // 3 de 3 → en el límite

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should include plan name and max_sites in ForbiddenException message for sites', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('sites');
    mockOrgConfigFindUnique.mockResolvedValue({ plan: 'PROFESSIONAL', max_users: 50, max_sites: 3 });
    mockWorkLocationCount.mockResolvedValue(3);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    const error = await guard.canActivate(context).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ForbiddenException);
    const message = (error as ForbiddenException).message;
    expect(message).toContain('PROFESSIONAL');
    expect(message).toContain('3');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Caché Redis
  // ───────────────────────────────────────────────────────────────────────────

  it('should use Redis cache for OrgConfig when available (no DB call)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('users');
    const cachedConfig = { plan: 'ENTERPRISE', max_users: 200, max_sites: 20 };
    mockRedisGet
      .mockResolvedValueOnce(JSON.stringify(cachedConfig)) // org-config hit
      .mockResolvedValueOnce(null); // user count cache miss
    mockUserCount.mockResolvedValue(50);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    await guard.canActivate(context);

    // Si usó caché, no debe haber llamado a prisma
    expect(mockOrgConfigFindUnique).not.toHaveBeenCalled();
  });
});
