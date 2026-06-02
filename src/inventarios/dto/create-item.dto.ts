import { IsString, IsOptional, IsNumber, IsBoolean, IsIn, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAccesorioDto } from './create-accesorio.dto';

export class CreateItemDto {
  @IsInt() @Min(1) numero: number;
  @IsOptional() @IsString() parte_no?: string;
  @IsOptional() @IsString() pais?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsString() modelo?: string;
  @IsOptional() @IsString() serial?: string;
  @IsOptional() @IsNumber() @Min(0) cantidad?: number;
  @IsOptional() @IsBoolean() extraido_por_ia?: boolean;
  @IsOptional() @IsIn(['sobrante', 'faltante']) tipo_novedad?: string;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => CreateAccesorioDto) accesorios?: CreateAccesorioDto[];
}
