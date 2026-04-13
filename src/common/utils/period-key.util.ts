import { DateTime } from 'luxon';

export type Frequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'ONCE'
  | 'PER_EVENT'
  | 'NONE'
  | 'INHERIT';

/**
 * Calcula la clave de período que identifica una "ventana de llenado" de un formulario.
 *
 * Ejemplos (zona America/Bogota):
 *   DAILY   → "2025-05-20"
 *   WEEKLY  → "2025-W20"
 *   MONTHLY → "2025-05"
 *   ONCE / PER_EVENT / NONE / INHERIT → null (sin restricción de período)
 */
export function computePeriodKey(
  frequency: Frequency,
  date?: Date,
): string | null {
  const dt = date
    ? DateTime.fromJSDate(date).setZone('America/Bogota')
    : DateTime.now().setZone('America/Bogota');

  switch (frequency) {
    case 'DAILY':
      return dt.toISODate(); // "2025-05-20"
    case 'WEEKLY':
      return `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, '0')}`; // "2025-W20"
    case 'MONTHLY':
      return dt.toFormat('yyyy-MM'); // "2025-05"
    default:
      return null;
  }
}
