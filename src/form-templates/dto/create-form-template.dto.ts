import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Frequency } from '@prisma/client';

export class CreateFormTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsString()
  @IsNotEmpty()
  category_id: string;

  @IsEnum(Frequency)
  @IsOptional()
  data_frequency?: Frequency;

  @IsEnum(Frequency)
  @IsOptional()
  signature_frequency?: Frequency;

  @IsBoolean()
  @IsOptional()
  export_pdf?: boolean;

  @IsBoolean()
  @IsOptional()
  export_excel?: boolean;

  /**
   * Cargos a los que se restringe el template.
   * Array vacío (o ausente) → visible para todos los operarios.
   * Ej: ["operario de grúas", "rigger"]
   */
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  target_job_titles?: string[];

  /**
   * Número de columnas del layout del formulario (1, 2 o 3).
   */
  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3])
  columns?: number;

  /**
   * URL del archivo fuente (PDF, imagen) usado para construir el formulario.
   */
  @IsOptional()
  @IsString()
  source_file_url?: string;

  /**
   * Metadata de secciones del formulario (Section[]).
   */
  @IsOptional()
  @IsArray()
  sections?: any[];

  /**
   * Campos del formulario (EditorField[]) para batch create junto con el template.
   */
  @IsOptional()
  @IsArray()
  fields?: any[];

  /**
   * Si true, guarda además una copia como blueprint privado del tenant.
   */
  @IsOptional()
  @IsBoolean()
  save_as_blueprint?: boolean;

  /**
   * Nombre del blueprint a crear (requerido si save_as_blueprint = true).
   */
  @IsOptional()
  @IsString()
  blueprint_name?: string;

  /**
   * Nombre de la categoría para el blueprint (fallback "General").
   * Independiente de category_id — se usa solo si save_as_blueprint = true.
   */
  @IsOptional()
  @IsString()
  category_name?: string;
}
