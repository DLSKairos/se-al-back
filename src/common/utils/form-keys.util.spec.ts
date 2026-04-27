import { toSnakeCase, ensureUniqueKeys } from './form-keys.util';

describe('toSnakeCase', () => {
  it('should convert spaces to underscores', () => {
    expect(toSnakeCase('nombre completo')).toBe('nombre_completo');
  });

  it('should lowercase the string', () => {
    expect(toSnakeCase('Nombre Completo')).toBe('nombre_completo');
  });

  it('should remove accented vowels', () => {
    expect(toSnakeCase('número teléfono')).toBe('numero_telefono');
  });

  it('should handle ñ by removing tilde diacritic (resulting in n)', () => {
    // NFD decomposition of ñ = n + combining tilde, tilde gets removed
    const result = toSnakeCase('cañón');
    expect(result).toBe('canon');
  });

  it('should remove special characters', () => {
    expect(toSnakeCase('campo (obligatorio)')).toBe('campo_obligatorio');
  });

  it('should handle multiple consecutive spaces', () => {
    expect(toSnakeCase('a  b   c')).toBe('a_b_c');
  });

  it('should handle strings with numbers', () => {
    expect(toSnakeCase('campo 1')).toBe('campo_1');
  });

  it('should trim leading and trailing spaces', () => {
    expect(toSnakeCase('  campo  ')).toBe('campo');
  });

  it('should handle already snake_case strings', () => {
    expect(toSnakeCase('campo_texto')).toBe('campo_texto');
  });

  it('should handle mixed tildes and special chars', () => {
    expect(toSnakeCase('Área de Salud')).toBe('area_de_salud');
  });

  it('should return empty string from empty input', () => {
    expect(toSnakeCase('')).toBe('');
  });

  it('should remove non-alphanumeric characters except underscores', () => {
    expect(toSnakeCase('campo@test!')).toBe('campotest');
  });
});

describe('ensureUniqueKeys', () => {
  it('should return fields with keys unchanged when all are unique', () => {
    const fields = [
      { key: 'campo_a', label: 'Campo A' },
      { key: 'campo_b', label: 'Campo B' },
    ];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('campo_a');
    expect(result[1].key).toBe('campo_b');
  });

  it('should generate key from label when key is empty', () => {
    const fields = [{ key: '', label: 'Nombre Completo' }];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('nombre_completo');
  });

  it('should generate key from label when key is only whitespace', () => {
    const fields = [{ key: '   ', label: 'Teléfono' }];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('telefono');
  });

  it('should generate key from label when key is undefined', () => {
    const fields: Array<{ key?: string; label: string }> = [{ label: 'Área de trabajo' }];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('area_de_trabajo');
  });

  it('should resolve collision by appending _2 to duplicate', () => {
    const fields = [
      { key: 'nombre', label: 'Nombre 1' },
      { key: 'nombre', label: 'Nombre 2' },
    ];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('nombre');
    expect(result[1].key).toBe('nombre_2');
  });

  it('should resolve triple collision with _2 and _3', () => {
    const fields = [
      { key: 'campo', label: 'Campo 1' },
      { key: 'campo', label: 'Campo 2' },
      { key: 'campo', label: 'Campo 3' },
    ];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('campo');
    expect(result[1].key).toBe('campo_2');
    expect(result[2].key).toBe('campo_3');
  });

  it('should handle collision between explicit key and label-derived key', () => {
    const fields = [
      { key: 'nombre', label: 'Primer campo' },
      { key: '', label: 'Nombre' }, // generates 'nombre' which collides
    ];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('nombre');
    expect(result[1].key).toBe('nombre_2');
  });

  it('should fallback to "campo" when label produces empty key', () => {
    const fields = [{ key: '', label: '!!!' }];
    const result = ensureUniqueKeys(fields);
    expect(result[0].key).toBe('campo');
  });

  it('should preserve other field properties', () => {
    const fields = [{ key: 'test', label: 'Test', type: 'TEXT', order: 1 }];
    const result = ensureUniqueKeys(fields);
    expect(result[0]).toMatchObject({ key: 'test', label: 'Test', type: 'TEXT', order: 1 });
  });

  it('should return empty array for empty input', () => {
    expect(ensureUniqueKeys([])).toEqual([]);
  });
});
