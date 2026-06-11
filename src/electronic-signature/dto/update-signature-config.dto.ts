import { SignatureMode } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';

/**
 * Actualiza la configuración de firma de una plantilla.
 * Todos los campos son opcionales (PATCH semántico).
 */
export class UpdateSignatureConfigDto {
  @IsEnum(SignatureMode, {
    message: 'El modo de firma debe ser STRICT o FLEXIBLE',
  })
  @IsOptional()
  signature_mode?: SignatureMode;

  @IsInt({ message: 'El tiempo mínimo de lectura debe ser un número entero de segundos' })
  @Min(0, { message: 'El tiempo mínimo de lectura no puede ser negativo' })
  @Type(() => Number)
  @IsOptional()
  min_reading_seconds?: number;

  @IsBoolean({ message: 'requires_internal_sign debe ser true o false' })
  @IsOptional()
  requires_internal_sign?: boolean;
}
