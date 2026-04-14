import {
  IsArray,
  IsBoolean,
  IsEnum,
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
}
