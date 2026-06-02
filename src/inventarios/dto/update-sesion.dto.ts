import { IsString, IsOptional, IsIn, IsUrl } from 'class-validator';
import { CreateSesionDto } from './create-sesion.dto';

export class UpdateSesionDto extends CreateSesionDto {
  @IsOptional() @IsIn(['borrador', 'completado', 'firmado', 'cerrado']) estado?: string;
  @IsOptional() @IsString() firmado_deposito_nombre?: string;
  @IsOptional() @IsString() firmado_agencia_nombre?: string;
  @IsOptional() @IsUrl() firmado_deposito_url?: string;
  @IsOptional() @IsUrl() firmado_agencia_url?: string;
}
