import { IsString, IsOptional } from 'class-validator';

export class CreateAccesorioDto {
  @IsOptional() @IsString() item_id?: string;
  @IsOptional() @IsString() parte_no?: string;
  @IsOptional() @IsString() pais?: string;
  @IsOptional() @IsString() descripcion?: string;
  @IsOptional() @IsString() marca?: string;
  @IsOptional() @IsString() modelo?: string;
}
