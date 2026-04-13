/**
 * Convierte un label de campo a snake_case sin tildes ni caracteres especiales.
 *
 * Ejemplos:
 *   "Tipo de Trabajo"      → "tipo_de_trabajo"
 *   "EPP en buen estado"   → "epp_en_buen_estado"
 *   "¿Fecha límite?"       → "fecha_limite"
 */
export function toSnakeCase(label: string): string {
  return label
    .replace(/[áÁ]/g, 'a')
    .replace(/[éÉ]/g, 'e')
    .replace(/[íÍ]/g, 'i')
    .replace(/[óÓ]/g, 'o')
    .replace(/[úÚü]/g, 'u')
    .replace(/[ñÑ]/g, 'n')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

/**
 * Alias mantenido por compatibilidad con código anterior.
 */
export function labelToSlug(label: string): string {
  return toSnakeCase(label);
}
