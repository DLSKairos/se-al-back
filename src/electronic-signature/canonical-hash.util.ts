import * as crypto from 'crypto';

// ════════════════════════════════════════════════════════════════════════════
// Hash canónico de documento — versión 1
//
// ADVERTENCIA: NO modificar el orden ni la estructura de los campos de este
// objeto sin incrementar HASH_VERSION y documentar la nueva estructura.
// El hash de integridad es evidencia legal bajo Decreto 2364 de 2012 (Colombia).
// Cualquier cambio rompe la verificación de registros firmados con versiones
// anteriores.
//
// Estructura v1:
// {
//   permiso_id: string,          — ID de la FormSubmission
//   empresa_id: string,          — org_id del submission
//   tipo_permiso: string,        — nombre del FormTemplate
//   fecha_creacion: string,      — submitted_at en ISO8601 (UTC)
//   preguntas: [                 — FormSubmissionValues ordenados por field_id asc
//     { id: string, pregunta: string, respuesta: string }
//   ],
//   firmantes: [                 — firmantes ordenados por cedula/user_id asc
//     { cedula: string, nombre: string, rol: string }
//   ]
// }
// ════════════════════════════════════════════════════════════════════════════

export const HASH_VERSION = 1;

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
 * Calcula el SHA-256 del objeto canónico del documento.
 * La serialización usa JSON.stringify con claves en orden fijo (definido por
 * la estructura de CanonicalDocument) para garantizar estabilidad entre ejecuciones.
 *
 * Reglas de estabilidad:
 * - preguntas ordenadas por id asc antes de pasar a esta función
 * - firmantes ordenados por cedula asc antes de pasar a esta función
 * - fecha_creacion siempre en ISO8601 UTC (toISOString())
 *
 * @param doc Objeto canónico pre-construido
 * @returns Hash SHA-256 en hex (64 caracteres)
 */
export function calculateCanonicalHash(doc: CanonicalDocument): string {
  const serialized = JSON.stringify(doc);
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
