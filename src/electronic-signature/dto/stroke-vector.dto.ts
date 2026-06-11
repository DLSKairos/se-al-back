import { Type } from 'class-transformer';
import { IsInt, IsNumber } from 'class-validator';

/** Un punto del trazo manuscrito: coordenadas + timestamp del punto. */
export class StrokeVectorDto {
  @IsNumber()
  x: number;

  @IsNumber()
  y: number;

  /** Timestamp en milisegundos de la captura del punto */
  @IsInt()
  @Type(() => Number)
  t: number;
}
