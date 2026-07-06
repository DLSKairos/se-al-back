import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Genera un token criptográficamente seguro en hexadecimal.
 * Reemplaza el uso de CUID para secretos (Fix seguridad M3).
 * @param bytes Número de bytes de entropía (default 32 = 256 bits).
 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Devuelve el hash SHA-256 (hex) de un token. Se almacena el hash, nunca el
 * token en claro (Fix seguridad C2).
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Compara dos hashes hex en tiempo constante para evitar timing attacks.
 * Devuelve false ante cualquier entrada inválida o de longitud distinta.
 */
export function safeCompareHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Verifica un código de activación de primer acceso (Fix C2) contra el hash y
 * la expiración almacenados. No consume el código (eso es responsabilidad del
 * llamador tras registrar el PIN/credencial).
 */
export function isActivationCodeValid(
  storedHash: string | null | undefined,
  expiresAt: Date | null | undefined,
  code: string | null | undefined,
): boolean {
  return (
    !!storedHash &&
    !!expiresAt &&
    expiresAt.getTime() > Date.now() &&
    typeof code === 'string' &&
    code.length > 0 &&
    safeCompareHex(storedHash, hashToken(code))
  );
}
