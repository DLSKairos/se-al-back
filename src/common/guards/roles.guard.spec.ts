import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function createMockContext(role: string, requiredRoles?: string[]): ExecutionContext {
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(requiredRoles),
  } as unknown as Reflector;

  const mockContext = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue({
        user: { sub: 'user-1', orgId: 'org-1', role, jobTitle: 'Tester' },
      }),
    }),
  } as unknown as ExecutionContext;

  return mockContext;
}

function buildGuardWithRoles(requiredRoles?: string[]): { guard: RolesGuard; context: ExecutionContext } {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);
  const guard = new RolesGuard(reflector);

  const context = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn(),
    }),
  } as unknown as ExecutionContext;

  return { guard, context };
}

describe('RolesGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  it('should allow SUPER_ADMIN even when ADMIN is required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const guard = new RolesGuard(reflector);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'u1', orgId: 'org-1', role: 'SUPER_ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow ADMIN when ADMIN is required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const guard = new RolesGuard(reflector);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'u1', orgId: 'org-1', role: 'ADMIN', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException for OPERATOR when ADMIN is required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const guard = new RolesGuard(reflector);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'u1', orgId: 'org-1', role: 'OPERATOR', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow any user when no roles are declared', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new RolesGuard(reflector);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'u1', orgId: 'org-1', role: 'OPERATOR', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow when roles array is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const guard = new RolesGuard(reflector);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'u1', orgId: 'org-1', role: 'OPERATOR', jobTitle: '' },
        }),
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user is not in request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);
    const guard = new RolesGuard(reflector);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ user: undefined }),
      }),
    } as unknown as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
