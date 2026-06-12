import {
  calculateCanonicalHash,
  CanonicalDocument,
  CanonicalQuestion,
  CanonicalSigner,
  HASH_VERSION,
} from './canonical-hash.util';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function buildDoc(overrides?: Partial<CanonicalDocument>): CanonicalDocument {
  return {
    permiso_id: 'sub-001',
    empresa_id: 'org-001',
    tipo_permiso: 'Permiso de Trabajo en Altura',
    fecha_creacion: '2026-06-10T12:00:00.000Z',
    preguntas: [
      { id: 'field-a', pregunta: '¿Uso EPP?', respuesta: 'Sí' },
      { id: 'field-b', pregunta: 'Temperatura ambiente', respuesta: '28' },
    ],
    firmantes: [
      { cedula: '100200300', nombre: 'Juan Pérez', rol: 'INTERNAL' },
      { cedula: '900800700', nombre: 'Carlos Rincón', rol: 'EXTERNAL' },
    ],
    ...overrides,
  };
}

// ─── Bloque de tests ──────────────────────────────────────────────────────────

describe('canonical-hash.util — calculateCanonicalHash', () => {
  describe('HASH_VERSION', () => {
    it('should export HASH_VERSION as numeric value 2 (stableStringify + firmantes as-of)', () => {
      expect(HASH_VERSION).toBe(2);
    });

    it('should be a number, not a string', () => {
      expect(typeof HASH_VERSION).toBe('number');
    });
  });

  describe('estabilidad del hash (determinismo)', () => {
    it('should return the same hash for identical input on repeated calls', () => {
      const doc = buildDoc();
      const hash1 = calculateCanonicalHash(doc);
      const hash2 = calculateCanonicalHash(doc);

      expect(hash1).toBe(hash2);
    });

    it('should return a 64-character lowercase hex string (SHA-256)', () => {
      const hash = calculateCanonicalHash(buildDoc());

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should return a different hash when the answer to a question changes', () => {
      const original = buildDoc();
      const modified = buildDoc({
        preguntas: [
          { id: 'field-a', pregunta: '¿Uso EPP?', respuesta: 'No' },
          { id: 'field-b', pregunta: 'Temperatura ambiente', respuesta: '28' },
        ],
      });

      expect(calculateCanonicalHash(original)).not.toBe(
        calculateCanonicalHash(modified),
      );
    });

    it('should return a different hash when a question text changes', () => {
      const original = buildDoc();
      const modified = buildDoc({
        preguntas: [
          { id: 'field-a', pregunta: '¿Utilizó EPP?', respuesta: 'Sí' },
          { id: 'field-b', pregunta: 'Temperatura ambiente', respuesta: '28' },
        ],
      });

      expect(calculateCanonicalHash(original)).not.toBe(
        calculateCanonicalHash(modified),
      );
    });

    it('should return a different hash when permiso_id changes', () => {
      const original = buildDoc();
      const modified = buildDoc({ permiso_id: 'sub-999' });

      expect(calculateCanonicalHash(original)).not.toBe(
        calculateCanonicalHash(modified),
      );
    });

    it('should return a different hash when empresa_id changes', () => {
      const original = buildDoc();
      const modified = buildDoc({ empresa_id: 'org-999' });

      expect(calculateCanonicalHash(original)).not.toBe(
        calculateCanonicalHash(modified),
      );
    });

    it('should return a different hash when fecha_creacion changes', () => {
      const original = buildDoc();
      const modified = buildDoc({ fecha_creacion: '2026-06-11T00:00:00.000Z' });

      expect(calculateCanonicalHash(original)).not.toBe(
        calculateCanonicalHash(modified),
      );
    });
  });

  describe('estabilidad respecto al orden de preguntas', () => {
    it('should produce DIFFERENT hashes when preguntas array order differs (order matters in v1)', () => {
      // La especificación v1 requiere ordenar por field_id asc ANTES de llamar
      // a esta función. Si el orden cambia aquí, el hash cambia (comportamiento correcto).
      const docAB = buildDoc({
        preguntas: [
          { id: 'field-a', pregunta: '¿Uso EPP?', respuesta: 'Sí' },
          { id: 'field-b', pregunta: 'Temperatura', respuesta: '28' },
        ],
      });
      const docBA = buildDoc({
        preguntas: [
          { id: 'field-b', pregunta: 'Temperatura', respuesta: '28' },
          { id: 'field-a', pregunta: '¿Uso EPP?', respuesta: 'Sí' },
        ],
      });

      // El hash depende del orden serializado — el servicio es responsable del sort previo.
      expect(calculateCanonicalHash(docAB)).not.toBe(
        calculateCanonicalHash(docBA),
      );
    });

    it('should produce the same hash when same preguntas are passed in the same order', () => {
      const preguntas: CanonicalQuestion[] = [
        { id: 'field-a', pregunta: '¿Uso EPP?', respuesta: 'Sí' },
        { id: 'field-b', pregunta: 'Temperatura', respuesta: '28' },
      ];

      const doc1 = buildDoc({ preguntas });
      const doc2 = buildDoc({ preguntas: [...preguntas] });

      expect(calculateCanonicalHash(doc1)).toBe(calculateCanonicalHash(doc2));
    });
  });

  describe('estabilidad respecto al orden de firmantes', () => {
    it('should produce DIFFERENT hashes when firmantes order differs (order matters in v1)', () => {
      const firmantes1: CanonicalSigner[] = [
        { cedula: '100200300', nombre: 'Juan', rol: 'INTERNAL' },
        { cedula: '900800700', nombre: 'Carlos', rol: 'EXTERNAL' },
      ];
      const firmantes2: CanonicalSigner[] = [
        { cedula: '900800700', nombre: 'Carlos', rol: 'EXTERNAL' },
        { cedula: '100200300', nombre: 'Juan', rol: 'INTERNAL' },
      ];

      const doc1 = buildDoc({ firmantes: firmantes1 });
      const doc2 = buildDoc({ firmantes: firmantes2 });

      expect(calculateCanonicalHash(doc1)).not.toBe(calculateCanonicalHash(doc2));
    });
  });

  describe('casos borde', () => {
    it('should handle empty preguntas array', () => {
      const doc = buildDoc({ preguntas: [] });
      const hash = calculateCanonicalHash(doc);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle empty firmantes array', () => {
      const doc = buildDoc({ firmantes: [] });
      const hash = calculateCanonicalHash(doc);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle a question with an empty answer', () => {
      const doc = buildDoc({
        preguntas: [{ id: 'field-x', pregunta: 'Campo opcional', respuesta: '' }],
      });
      const hash = calculateCanonicalHash(doc);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
