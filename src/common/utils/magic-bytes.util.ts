import { BadRequestException } from '@nestjs/common';

/**
 * Valida que los primeros bytes de un buffer coincidan con la firma del tipo MIME declarado.
 * Previene ataques de content-type spoofing (Fix #9).
 */
export function validateMagicBytes(buffer: Buffer, mimetype: string): void {
  if (buffer.length < 4) {
    throw new BadRequestException('Archivo demasiado pequeño o inválido');
  }

  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];

  switch (mimetype) {
    case 'image/jpeg':
      // FF D8 FF
      if (!(b0 === 0xff && b1 === 0xd8 && b2 === 0xff)) {
        throw new BadRequestException('El archivo no es una imagen JPEG válida');
      }
      break;

    case 'image/png':
      // 89 50 4E 47
      if (!(b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47)) {
        throw new BadRequestException('El archivo no es una imagen PNG válida');
      }
      break;

    case 'image/webp':
      // RIFF....WEBP — bytes 0-3: 52 49 46 46, bytes 8-11: 57 45 42 50
      if (!(b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46)) {
        throw new BadRequestException('El archivo no es una imagen WebP válida');
      }
      // Verificar el marcador WEBP en offset 8 si el buffer es suficientemente largo
      if (buffer.length >= 12) {
        const webpMarker = buffer.slice(8, 12).toString('ascii');
        if (webpMarker !== 'WEBP') {
          throw new BadRequestException('El archivo no es una imagen WebP válida');
        }
      }
      break;

    case 'application/pdf':
      // %PDF — 25 50 44 46
      if (!(b0 === 0x25 && b1 === 0x50 && b2 === 0x44 && b3 === 0x46)) {
        throw new BadRequestException('El archivo no es un PDF válido');
      }
      break;

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.ms-excel':
      // ZIP (PK) — 50 4B 03 04
      if (!(b0 === 0x50 && b1 === 0x4b)) {
        throw new BadRequestException('El archivo no es un documento Office válido');
      }
      break;

    default:
      throw new BadRequestException(`Tipo de archivo no soportado: ${mimetype}`);
  }
}
