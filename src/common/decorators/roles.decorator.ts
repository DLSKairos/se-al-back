import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Declara qué roles pueden acceder a un endpoint.
 * Ejemplo: @Roles('ADMIN', 'SUPERVISOR')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
