import * as crypto from 'crypto';

// ════════════════════════════════════════════════════════════════════════════
// Hash canónico de documento — versión 2
//
// ADVERTENCIA: NO modificar el orden ni la estructura de los campos de este
// objeto sin incrementar HASH_VERSION y documentar la nueva estructura.
// El hash de integridad es evidencia legal bajo Decreto 2364 de 2012 (Colombia).
// Cualquier cambio rompe la verificación de registros firmados con versiones
// anteriores.
//
// Diferencias v1 → v2:
//   v1: JSON.stringify (orden de claves dependiente del motor JS) + firmantes al
//       momento de la consulta (lista inestable si se agregan firmantes después
//       de la firma).
//   v2: stableStringify (claves recursivamente ordenadas, producción estable en
//       cualquier entorno) + firmantes as-of (solo los que existían en o antes de
//       asOf, evitando que firmas futuras alteren el hash de una firma ya firmada).
//
// Estructura v2 (idéntica a v1 en campos; el cambio es en la serialización y
// la semántica temporal de la lista de firmantes):
// {
//   permiso_id: string,          — ID de la FormSubmission
//   empresa_id: string,          — org_id del submission
//   tipo_permiso: string,        — nombre del FormTemplate
//   fecha_creacion: string,      — submitted_at en ISO8601 (UTC)
//   preguntas: [                 — FormSubmissionValues ordenados por field_id asc
//     { id: string, pregunta: string, respuesta: string }
//   ],
//   firmantes: [                 — firmantes que existían en o antes de asOf,
//                                  ordenados por cedula/user_id asc
//     { cedula: string, nombre: string, rol: string }
//   ]
// }
// ════════════════════════════════════════════════════════════════════════════

export const HASH_VERSION = 2;

export interface CanonicalQuestion {
  id: string;
  pregunta: string;
  respuesta: string;
}

export interface CanonicalSigner {
  cedula: string;
  nombre: string;
  rol: string;
}

export interface CanonicalDocument {
  permiso_id: string;
  empresa_id: string;
  tipo_permiso: string;
  fecha_creacion: string;
  preguntas: CanonicalQuestion[];
  firmantes: CanonicalSigner[];
}

/**
 * Serializa cualquier valor con claves de objetos en orden lexicográfico
 * (recursivo), garantizando que la serialización sea idéntica en cualquier
 * motor JS/V8 independientemente del orden de inserción de las propiedades.
 *
 * - Los arrays mantienen su orden (son posicionales, no tienen "claves de objeto").
 * - Los objetos tienen sus claves ordenadas de forma estable.
 * - Primitivos (string, number, boolean, null) se comportan como JSON.stringify.
 */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
    const parts = sortedKeys.map(
      (k) =>
        JSON.stringify(k) +
        ':' +
        stableStringify((value as Record<string, unknown>)[k]),
    );
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(value);
}

/**
 * Calcula el SHA-256 del objeto canónico del documento.
 * La serialización usa stableStringify (claves ordenadas, v2) para garantizar
 * estabilidad entre ejecuciones y entornos.
 *
 * Reglas de estabilidad:
 * - preguntas ordenadas por id asc antes de pasar a esta función
 * - firmantes ordenados por cedula asc antes de pasar a esta función (as-of)
 * - fecha_creacion siempre en ISO8601 UTC (toISOString())
 *
 * @param doc Objeto canónico pre-construido
 * @returns Hash SHA-256 en hex (64 caracteres)
 */
export function calculateCanonicalHash(doc: CanonicalDocument): string {
  const serialized = stableStringify(doc);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
