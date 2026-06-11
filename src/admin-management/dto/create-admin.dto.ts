import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAdminDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEmail({}, { message: 'El email debe ser una dirección válida' })
  email: string;

  /**
   * Número de identificación — opcional hasta completar activación OAuth.
   */
  @IsOptional()
  @IsString()
  identification_number?: string;
}
