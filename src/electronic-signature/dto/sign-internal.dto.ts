import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBase64,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ReadingLogEntryDto } from './reading-log-entry.dto';
import { StrokeVectorDto } from './stroke-vector.dto';

/**
 * Firma de usuario interno (autenticado con JWT de SEÑAL).
 *
 * El submission_id se toma del parámetro de ruta (:submissionId), NO del body.
 */
export class SignInternalDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe incluir al menos un punto del trazo' })
  @ValidateNested({ each: true })
  @Type(() => StrokeVectorDto)
  stroke_vectors: StrokeVectorDto[];

  @IsString()
  @IsNotEmpty({ message: 'La imagen del trazo es requerida' })
  @IsBase64()
  stroke_image_base64: string;

  @IsNumber({}, { message: 'La latitud debe ser un número' })
  geo_lat: number;

  @IsNumber({}, { message: 'La longitud debe ser un número' })
  geo_lng: number;

  @IsNumber()
  @IsOptional()
  geo_accuracy?: number;

  @IsArray()
  @ArrayMinSize(1, { message: 'El log de lectura no puede estar vacío' })
  @ValidateNested({ each: true })
  @Type(() => ReadingLogEntryDto)
  reading_log: ReadingLogEntryDto[];

  /**
   * Indica si la sesión WebAuthn estaba activa al momento de la firma.
   * El frontend lo determina según si el login fue biométrico.
   */
  @IsOptional()
  webauthn_session_active?: boolean;
}
