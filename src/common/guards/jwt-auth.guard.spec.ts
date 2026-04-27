import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  it('should return true immediately for @Public() endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn(),
    } as unknown as ExecutionContext;

    const result = guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should call super.canActivate for non-public endpoints', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

    // Espiar super.canActivate
    const superCanActivateSpy = jest
      .spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
      .mockReturnValue(true);

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({ headers: {} }),
      }),
    } as unknown as ExecutionContext;

    guard.canActivate(context);

    expect(superCanActivateSpy).toHaveBeenCalledWith(context);
  });

  it('should check IS_PUBLIC_KEY using reflector.getAllAndOverride', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(true);

    const context = {
      getHandler: jest.fn().mockReturnValue('handler'),
      getClass: jest.fn().mockReturnValue('class'),
      switchToHttp: jest.fn(),
    } as unknown as ExecutionContext;

    guard.canActivate(context);

    expect(spy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
