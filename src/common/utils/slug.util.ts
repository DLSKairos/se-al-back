/**
 * Convierte un label de campo a snake_case sin tildes ni caracteres especiales.
 *
 * Implementación canónica en form-keys.util.ts (con tests) — este módulo
 * re-exporta la misma función para mantener compatibilidad con callers existentes.
 *
 * Ejemplos:
 *   "Tipo de Trabajo"      → "tipo_de_trabajo"
 *   "EPP en buen estado"   → "epp_en_buen_estado"
 *   "¿Fecha límite?"       → "fecha_limite"
 */
export { toSnakeCase } from './form-keys.util';
