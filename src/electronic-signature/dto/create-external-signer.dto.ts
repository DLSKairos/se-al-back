import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Crea un firmante externo en el catálogo de la obra.
 * La cédula es única por work_location (constraint en BD).
 */
export class CreateExternalSignerDto {
  @IsString()
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @MaxLength(200, { message: 'El nombre no puede superar 200 caracteres' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'El número de cédula es requerido' })
  @MinLength(5, { message: 'La cédula debe tener al menos 5 caracteres' })
  @MaxLength(20, { message: 'La cédula no puede superar 20 caracteres' })
  @Matches(/^[0-9]+$/, { message: 'La cédula debe contener solo números' })
  identification_number: string;

  @IsString()
  @IsNotEmpty({ message: 'El número de celular es requerido' })
  @Matches(/^\+?[0-9]{7,15}$/, {
    message: 'Número de celular inválido. Ejemplo: +573001234567',
  })
  phone: string;

  @IsString()
  @IsNotEmpty({ message: 'El ID de la sede/obra es requerido' })
  work_location_id: string;
}
