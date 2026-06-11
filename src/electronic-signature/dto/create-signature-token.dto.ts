import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Genera un token de firma para un firmante externo sobre un submission concreto.
 * El token tiene expiración configurada por SIGNATURE_TOKEN_TTL_HOURS (env, default 2h).
 * Es de un solo uso: una vez firmado, no puede reutilizarse.
 */
export class CreateSignatureTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'El ID del submission es requerido' })
  form_submission_id: string;

  @IsString()
  @IsNotEmpty({ message: 'El ID del firmante externo es requerido' })
  external_signer_id: string;
}
