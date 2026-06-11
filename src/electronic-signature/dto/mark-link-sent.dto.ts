import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Marca el link de un firmante externo como "enviado" (el operario abrió WhatsApp).
 * Se usa cuando el frontend detecta que el usuario regresó a la app tras abrir WhatsApp.
 */
export class MarkLinkSentDto {
  @IsString()
  @IsNotEmpty({ message: 'El ID del token de firma es requerido' })
  signature_token_id: string;
}
