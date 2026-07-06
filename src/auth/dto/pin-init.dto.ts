import { IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO para el primer acceso por PIN. Además de la cédula y el PIN, exige el
 * código de activación entregado por el administrador fuera de banda
 * (Fix seguridad C2).
 */
export class PinInitDto {
  @IsString()
  @IsNotEmpty()
  identification_number: string;

  @IsString()
  @IsNotEmpty()
  pin: string;

  @IsString()
  @IsNotEmpty()
  activation_code: string;
}
