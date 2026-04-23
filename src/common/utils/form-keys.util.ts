/**
 * Convierte un string a snake_case para usar como key de campo.
 * Elimina tildes, caracteres especiales y reemplaza espacios por _.
 */
export function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s_]/g, '')
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Garantiza que todos los keys sean únicos dentro del array.
 * Si hay colisión agrega sufijo _2, _3, etc.
 * Si key viene vacío, lo genera desde label.
 */
export function ensureUniqueKeys<T extends { key?: string; label: string }>(
  fields: T[],
): T[] {
  const seen = new Map<string, number>();

  return fields.map((field) => {
    let key = field.key?.trim() ? field.key.trim() : toSnakeCase(field.label);
    if (!key) key = 'campo';

    if (seen.has(key)) {
      const count = seen.get(key)! + 1;
      seen.set(key, count);
      key = `${key}_${count}`;
    } else {
      seen.set(key, 1);
    }

    return { ...field, key };
  });
}
