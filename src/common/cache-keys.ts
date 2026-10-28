/**
 * Claves y TTLs de la caché de lectura en Redis (datos de baja frecuencia de cambio).
 * Toda mutación que afecte estos datos debe invalidar la clave correspondiente.
 */
export const CACHE_TTL = {
  /** Catálogos de la org (categorías, ubicaciones, departamentos, plantillas activas). */
  CATALOG: 120,
};

export const cacheKeys = {
  activeTemplates: (orgId: string) => `cache:templates:active:${orgId}`,
  categories: (orgId: string) => `cache:categories:${orgId}`,
  departments: (orgId: string) => `cache:departments:${orgId}`,
  locationsActive: (orgId: string) => `cache:locations:active:${orgId}`,
  locationsAll: (orgId: string) => `cache:locations:all:${orgId}`,
};
