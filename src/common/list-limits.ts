/**
 * Topes duros para listados sin paginación. No cambian la forma de la respuesta:
 * son una red de seguridad para que una org grande no devuelva tablas completas.
 * Si un listado puede superar el tope en uso real, hay que paginarlo en la API.
 */
export const LIST_LIMITS = {
  /** Historiales que crecen con el tiempo (se devuelven los más recientes). */
  RECENT: 200,
  /** Catálogos administrativos de una org o de la plataforma. */
  CATALOG: 500,
  /** Usuarios activos de una org (ya acotado por el plan, max_users). */
  USERS: 2000,
};
