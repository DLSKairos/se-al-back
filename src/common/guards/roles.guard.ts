import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../../auth/dto/jwt-payload.dto';

/**
 * Guard de roles.
 * Debe aplicarse después de JwtAuthGuard (el usuario ya debe estar en req.user).
 * SUPER_ADMIN siempre pasa. Si el endpoint no declara @Roles, pasa cualquiera.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Sin restricción de rol → cualquier usuario autenticado puede pasar
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: JwtPayload }>();

    if (!user) {
      throw new ForbiddenException('Acceso denegado');
    }

    // SUPER_ADMIN siempre tiene acceso
    if (user.role === 'SUPER_ADMIN') return true;

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `Se requiere uno de los siguientes roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
