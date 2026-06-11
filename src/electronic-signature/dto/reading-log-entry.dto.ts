import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

/**
 * Entrada del log de lectura por sección o pregunta.
 * El ID puede ser el ID de la sección (para externos) o el ID del campo/pregunta
 * (para internos en modo Juego o Lite).
 */
export class ReadingLogEntryDto {
  @IsString()
  @IsNotEmpty()
  section_or_field_id: string;

  /** Segundos que el firmante visualizó esta sección/pregunta */
  @IsInt()
  @Min(0)
  @Type(() => Number)
  seconds_viewed: number;
}
