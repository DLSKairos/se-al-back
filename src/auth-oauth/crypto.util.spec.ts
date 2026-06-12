import { decrypt, encrypt, randomHex } from './crypto.util';

// ═══════════════════════════════════════════════════════════════════════════════
// FIXTURE
// Clave de 32 bytes (64 hex chars) para los tests. NO usar en producción.
// ═══════════════════════════════════════════════════════════════════════════════

const TEST_KEY_HEX = 'a'.repeat(64); // 32 bytes de ceros en hex — solo para tests

// ═══════════════════════════════════════════════════════════════════════════════
// SUITE
// ═══════════════════════════════════════════════════════════════════════════════

describe('crypto.util — encrypt / decrypt', () => {
  // ───────────────────────────────────────────────────────────────────────────
  // Roundtrip
  // ───────────────────────────────────────────────────────────────────────────

  describe('roundtrip encrypt → decrypt', () => {
    it('should recover the original plaintext after encrypting and decrypting', () => {
      const plaintext = 'hello world';
      const ciphertext = encrypt(plaintext, TEST_KEY_HEX);
      const recovered = decrypt(ciphertext, TEST_KEY_HEX);

      expect(recovered).toBe(plaintext);
    });

    it('should work with Unicode / multibyte characters', () => {
      const plaintext = 'Contraseña segura: çñ€ 🔒';
      const ciphertext = encrypt(plaintext, TEST_KEY_HEX);
      const recovered = decrypt(ciphertext, TEST_KEY_HEX);

      expect(recovered).toBe(plaintext);
    });

    it('should work with an empty string', () => {
      const ciphertext = encrypt('', TEST_KEY_HEX);
      const recovered = decrypt(ciphertext, TEST_KEY_HEX);

      expect(recovered).toBe('');
    });

    it('should work with a long string (>1 KB)', () => {
      const plaintext = 'x'.repeat(2000);
      const ciphertext = encrypt(plaintext, TEST_KEY_HEX);
      const recovered = decrypt(ciphertext, TEST_KEY_HEX);

      expect(recovered).toBe(plaintext);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Formato del ciphertext
  // ───────────────────────────────────────────────────────────────────────────

  describe('ciphertext format', () => {
    it('should produce output in the format "iv:tag:ciphertext" (three colon-separated parts)', () => {
      const ciphertext = encrypt('test', TEST_KEY_HEX);
      const parts = ciphertext.split(':');

      expect(parts).toHaveLength(3);
    });

    it('should have IV of 24 hex characters (12 bytes × 2)', () => {
      const ciphertext = encrypt('test', TEST_KEY_HEX);
      const [ivHex] = ciphertext.split(':');

      expect(ivHex).toMatch(/^[0-9a-f]{24}$/);
    });

    it('should have auth tag of 32 hex characters (16 bytes × 2)', () => {
      const ciphertext = encrypt('test', TEST_KEY_HEX);
      const [, tagHex] = ciphertext.split(':');

      expect(tagHex).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // IV diferente por llamada (no reutilización de IV)
  // ───────────────────────────────────────────────────────────────────────────

  describe('IV uniqueness', () => {
    it('should use a different IV on every encryption call', () => {
      const plaintext = 'same plaintext';
      const cipher1 = encrypt(plaintext, TEST_KEY_HEX);
      const cipher2 = encrypt(plaintext, TEST_KEY_HEX);

      const iv1 = cipher1.split(':')[0];
      const iv2 = cipher2.split(':')[0];

      // Con probabilidad abrumadora los IVs aleatorios son distintos
      expect(iv1).not.toBe(iv2);
    });

    it('should produce different ciphertexts for the same plaintext (due to random IV)', () => {
      const ct1 = encrypt('hello', TEST_KEY_HEX);
      const ct2 = encrypt('hello', TEST_KEY_HEX);

      expect(ct1).not.toBe(ct2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Manipulación del ciphertext → error de autenticación GCM
  // ───────────────────────────────────────────────────────────────────────────

  describe('tamper detection', () => {
    it('should throw when ciphertext data bytes are altered', () => {
      const ciphertext = encrypt('sensitive data', TEST_KEY_HEX);
      const [ivHex, tagHex, dataHex] = ciphertext.split(':');

      // Alterar el primer byte del data hex
      const tamperedDataHex =
        dataHex.slice(0, 2) === 'ff'
          ? '00' + dataHex.slice(2)
          : 'ff' + dataHex.slice(2);

      const tampered = `${ivHex}:${tagHex}:${tamperedDataHex}`;

      expect(() => decrypt(tampered, TEST_KEY_HEX)).toThrow();
    });

    it('should throw when the auth tag is altered', () => {
      const ciphertext = encrypt('sensitive data', TEST_KEY_HEX);
      const [ivHex, tagHex, dataHex] = ciphertext.split(':');

      const tamperedTag =
        tagHex.slice(0, 2) === 'ff'
          ? '00' + tagHex.slice(2)
          : 'ff' + tagHex.slice(2);

      const tampered = `${ivHex}:${tamperedTag}:${dataHex}`;

      expect(() => decrypt(tampered, TEST_KEY_HEX)).toThrow();
    });

    it('should throw when decrypted with a different key', () => {
      const ciphertext = encrypt('sensitive data', TEST_KEY_HEX);
      const differentKey = 'b'.repeat(64);

      expect(() => decrypt(ciphertext, differentKey)).toThrow();
    });

    it('should throw when ciphertext format is invalid (not three parts)', () => {
      expect(() => decrypt('invalid:format', TEST_KEY_HEX)).toThrow();
      expect(() => decrypt('no-colons-at-all', TEST_KEY_HEX)).toThrow();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Validación de longitud de clave
  // ───────────────────────────────────────────────────────────────────────────

  describe('key validation', () => {
    it('should throw when encrypt receives a key shorter than 32 bytes', () => {
      expect(() => encrypt('test', 'short')).toThrow(
        /32 bytes/,
      );
    });

    it('should throw when encrypt receives a key longer than 32 bytes', () => {
      const longKey = 'a'.repeat(66); // 33 bytes en hex
      expect(() => encrypt('test', longKey)).toThrow(
        /32 bytes/,
      );
    });

    it('should throw when decrypt receives a key shorter than 32 bytes', () => {
      const ciphertext = encrypt('test', TEST_KEY_HEX);
      expect(() => decrypt(ciphertext, 'short')).toThrow(/32 bytes/);
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────────
// randomHex
// ───────────────────────────────────────────────────────────────────────────────

describe('crypto.util — randomHex', () => {
  it('should return a hex string of length 2 * bytes', () => {
    const hex = randomHex(16);
    expect(hex).toHaveLength(32);
    expect(hex).toMatch(/^[0-9a-f]+$/);
  });

  it('should return different values on each call', () => {
    const hex1 = randomHex(16);
    const hex2 = randomHex(16);
    expect(hex1).not.toBe(hex2);
  });

  it('should handle small byte counts (1 byte = 2 hex chars)', () => {
    const hex = randomHex(1);
    expect(hex).toHaveLength(2);
    expect(hex).toMatch(/^[0-9a-f]{2}$/);
  });
});
