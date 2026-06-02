import { IsString, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';

export class CreateSesionDto {
  @IsOptional() @IsString() tipo_formulario?: string;
  @IsOptional() @IsString() agencia_aduanas?: string;
  @IsOptional() @IsString() codigo_agencia?: string;
  @IsOptional() @IsString() representante_legal?: string;
  @IsOptional() @IsString() mandato?: string;
  @IsOptional() @IsString() deposito?: string;
  @IsOptional() @IsString() direccion_deposito?: string;
  @IsOptional() @IsString() documento_transporte?: string;
  @IsOptional() @IsString() manifiesto?: string;
  @IsOptional() @IsDateString() fecha_manifiesto?: string;
  @IsOptional() @IsString() transportadora?: string;
  @IsOptional() @IsString() consignatario?: string;
  @IsOptional() @IsNumber() @Min(0) no_bultos?: number;
  @IsOptional() @IsNumber() @Min(0) peso?: number;
  @IsOptional() @IsString() precintos_retira?: string;
  @IsOptional() @IsString() precintos_coloca?: string;
  @IsOptional() @IsString() observaciones?: string;
}
