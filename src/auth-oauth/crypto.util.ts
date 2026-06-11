import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;   // 96 bits — recomendado para GCM
const TAG_LENGTH = 16;  // 128 bits — default de GCM

/**
 * Cifra un texto plano usando AES-256-GCM.
 * Formato de salida: "<iv_hex>:<tag_hex>:<ciphertext_hex>"
 *
 * @param plaintext Texto a cifrar
 * @param keyHex   Clave de 32 bytes en hexadecimal (ENCRYPTION_KEY del .env)
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY debe ser exactamente 32 bytes (64 caracteres hex).');
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Descifra un texto cifrado con AES-256-GCM.
 * Formato esperado: "<iv_hex>:<tag_hex>:<ciphertext_hex>"
 *
 * @param ciphertext Cadena cifrada en formato iv:tag:datos
 * @param keyHex     Clave de 32 bytes en hexadecimal
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY debe ser exactamente 32 bytes (64 caracteres hex).');
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de texto cifrado inválido. Se esperaba "iv:tag:datos".');
  }

  const [ivHex, tagHex, dataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Genera N bytes criptográficamente seguros en formato hexadecimal.
 * Usado para code_verifier y state de PKCE.
 */
export function randomHex(bytes: number): string {
  return randomBytes(bytes).toString('hex');
}
