import { SetMetadata } from '@nestjs/common';

export const PLAN_LIMIT_RESOURCE_KEY = 'planLimitResource';

export type PlanLimitResource = 'users' | 'sites';

/**
 * Declara qué recurso debe verificar PlanLimitsGuard antes de permitir la creación.
 * Uso: @PlanLimitResource('users') o @PlanLimitResource('sites')
 */
export const PlanLimitResource = (resource: PlanLimitResource) =>
  SetMetadata(PLAN_LIMIT_RESOURCE_KEY, resource);
